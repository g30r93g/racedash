import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ─── Config ──────────────────────────────────────────────────────────────────

interface EnvVar {
  key: string
  description: string
  default?: string
  required: boolean
  /** If true, the value is derived and never prompted */
  computed?: boolean
}

/** Read LocalStack vars from the canonical env.localstack file (single source of truth) */
function loadLocalstackVars(): EnvVar[] {
  const envFile = path.join(ROOT, 'infra', 'localstack-init', 'env.localstack')
  if (!fs.existsSync(envFile)) {
    console.warn(`  Warning: ${envFile} not found — using fallback defaults.`)
    return []
  }
  const lines = fs.readFileSync(envFile, 'utf-8').split('\n')
  const vars: EnvVar[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx)
    const value = trimmed.slice(eqIdx + 1)
    vars.push({ key, description: `LocalStack: ${key}`, default: value, required: true, computed: true })
  }
  return vars
}

const LOCALSTACK_VARS: EnvVar[] = loadLocalstackVars()

const DB_VARS: EnvVar[] = [
  { key: 'DATABASE_URL', description: 'PostgreSQL connection string', default: 'postgresql://racedash:racedash_local@localhost:5433/racedash_local', required: true },
]

const CLERK_VARS: EnvVar[] = [
  { key: 'CLERK_SECRET_KEY', description: 'Clerk secret key (from dashboard.clerk.com)', required: true },
  { key: 'CLERK_WEBHOOK_SECRET', description: 'Clerk webhook secret', required: false },
]

const STRIPE_VARS: EnvVar[] = [
  { key: 'STRIPE_SECRET_KEY', description: 'Stripe secret key (test mode)', required: false },
  { key: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook secret', required: false },
  { key: 'STRIPE_PRICE_PLUS', description: 'Stripe Plus plan price ID', required: false },
  { key: 'STRIPE_PRICE_PRO', description: 'Stripe Pro plan price ID', required: false },
  { key: 'STRIPE_PRICE_CREDITS_50', description: 'Stripe 50-credit price ID', required: false },
  { key: 'STRIPE_PRICE_CREDITS_100', description: 'Stripe 100-credit price ID', required: false },
  { key: 'STRIPE_PRICE_CREDITS_250', description: 'Stripe 250-credit price ID', required: false },
  { key: 'STRIPE_PRICE_CREDITS_500', description: 'Stripe 500-credit price ID', required: false },
]

const APP_VARS: EnvVar[] = [
  { key: 'ADMIN_APP_ORIGIN', description: 'Admin app URL', default: 'http://localhost:3001', required: true },
]

const SECTIONS = [
  { name: 'LocalStack (AWS)', vars: LOCALSTACK_VARS },
  { name: 'Database', vars: DB_VARS },
  { name: 'Clerk Auth', vars: CLERK_VARS },
  { name: 'Stripe Payments', vars: STRIPE_VARS },
  { name: 'App Config', vars: APP_VARS },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadExistingEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
  const env: Record<string, string> = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1)
  }
  return env
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const envPath = path.join(ROOT, 'apps', 'api', '.env.local')
  const existing = loadExistingEnv(envPath)
  const result: Record<string, string> = {}

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  console.log('\n=== RaceDash Local Environment Setup ===\n')

  if (Object.keys(existing).length > 0) {
    console.log(`Found existing ${path.relative(ROOT, envPath)} — current values shown as defaults.\n`)
  }

  for (const section of SECTIONS) {
    console.log(`\n── ${section.name} ${'─'.repeat(Math.max(0, 50 - section.name.length))}`)

    for (const v of section.vars) {
      // Computed vars are auto-populated, never prompted
      if (v.computed) {
        result[v.key] = v.default!
        continue
      }

      const current = existing[v.key]
      const defaultVal = current ?? v.default
      const reqTag = v.required ? ' (required)' : ' (optional, Enter to skip)'
      const defaultHint = defaultVal ? ` [${defaultVal}]` : ''

      const answer = await ask(rl, `  ${v.key}${reqTag}${defaultHint}: `)
      const value = answer.trim() || defaultVal || ''

      if (v.required && !value) {
        console.log(`    ⚠ Skipped required var — you'll need to set ${v.key} before running the API.`)
      }

      if (value) {
        result[v.key] = value
      }
    }
  }

  rl.close()

  // Build file content
  const lines: string[] = [
    '# Generated by: pnpm setup:env',
    `# Date: ${new Date().toISOString()}`,
    '#',
    '# LocalStack AWS services (auto-populated)',
  ]

  for (const section of SECTIONS) {
    lines.push('')
    lines.push(`# ${section.name}`)
    for (const v of section.vars) {
      if (result[v.key]) {
        lines.push(`${v.key}=${result[v.key]}`)
      }
    }
  }

  lines.push('')

  fs.mkdirSync(path.dirname(envPath), { recursive: true })
  fs.writeFileSync(envPath, lines.join('\n'), 'utf-8')

  console.log(`\n✓ Written to ${path.relative(ROOT, envPath)}`)
  console.log('  Start the API with: cd apps/api && pnpm dev')
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
