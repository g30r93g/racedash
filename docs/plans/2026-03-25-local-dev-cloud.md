# Local Cloud Development Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update each checkbox as you complete each step.

**Goal:** Unify local cloud development into a single command with health-check readiness, persistent LocalStack option, interactive env setup, and convenience scripts for inspecting SES emails and Step Functions executions.

**Architecture:** Merge the two separate Docker Compose files (Postgres + LocalStack) into one root-level file. Add shell scripts for health-check waiting, interactive `.env.local` generation, and cloud inspection utilities. Pin LocalStack to `4.14.0` with a version-check warning. Wire everything into root `package.json` scripts.

**Tech Stack:** Docker Compose, Bash, Node.js (for the interactive env script via `readline`), pnpm, LocalStack 4.14.0, `awslocal` CLI.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `docker-compose.local.yml` | Unified Postgres + LocalStack compose |
| Modify | `infra/docker-compose.localstack.yml` | Pin version, add version-check label |
| Create | `scripts/wait-for-localstack.sh` | Poll `/_localstack/health` + verify init resources ready |
| Create | `scripts/check-localstack-version.sh` | Warn if pinned version != latest on Docker Hub |
| Create | `scripts/setup-env.ts` | Interactive `.env.local` generator |
| Create | `scripts/ses-inbox.sh` | Query LocalStack SES sent messages |
| Create | `scripts/sfn-execute.sh` | Start + tail a Step Functions execution |
| Modify | `package.json` | Add root-level local dev scripts |
| Modify | `infra/package.json` | Update `localstack:up/down/reset` + add `localstack:fresh`, `localstack:logs` |
| Modify | `infra/localstack-init/setup.sh` | Make idempotent with `2>/dev/null \|\| true` on all create commands |
| Modify | `infra/localstack-init/env.localstack` | No change (consumed by setup-env.ts) |

---

### Task 1: Pin LocalStack Version & Add Version Warning

**Files:**
- Modify: `infra/docker-compose.localstack.yml`
- Create: `scripts/check-localstack-version.sh`

- [ ] **Step 1: Pin LocalStack image to 4.14.0 and remove deprecated env var**

In `infra/docker-compose.localstack.yml`, change the image line and remove `LAMBDA_EXECUTOR` (deprecated in LocalStack 4.x — silently ignored):

```yaml
services:
  localstack:
    image: localstack/localstack:4.14.0
    ports:
      - "4566:4566"
      - "4510-4559:4510-4559"
    environment:
      - SERVICES=s3,sqs,stepfunctions,lambda,ses,events,iam
      - DEBUG=0
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "./localstack-init:/etc/localstack/init/ready.d"
```

- [ ] **Step 2: Create the version-check script**

Create `scripts/check-localstack-version.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Pinned version — update this when upgrading LocalStack
PINNED_VERSION="4.14.0"

echo "Checking for latest LocalStack version..."

# Fetch the latest stable version tag from Docker Hub (exclude -bigdata, -arm64, -amd64 suffixes)
LATEST=$(curl -sf "https://hub.docker.com/v2/repositories/localstack/localstack/tags/?page_size=50&ordering=last_updated" \
  | python3 -c "
import sys, json, re
tags = json.load(sys.stdin)['results']
versions = [t['name'] for t in tags if re.match(r'^\d+\.\d+\.\d+$', t['name'])]
print(versions[0] if versions else '')
" 2>/dev/null) || true

if [ -z "$LATEST" ]; then
  echo "  ⚠ Could not fetch latest version from Docker Hub (offline?). Using pinned version $PINNED_VERSION."
  exit 0
fi

if [ "$PINNED_VERSION" != "$LATEST" ]; then
  echo "  ⚠ LocalStack $LATEST is available (pinned: $PINNED_VERSION)."
  echo "    Update image tag in infra/docker-compose.localstack.yml and docker-compose.local.yml"
  echo "    Then update PINNED_VERSION in scripts/check-localstack-version.sh"
else
  echo "  LocalStack $PINNED_VERSION is the latest version."
fi
```

- [ ] **Step 3: Make it executable and test**

Run:
```bash
chmod +x scripts/check-localstack-version.sh
./scripts/check-localstack-version.sh
```

Expected: prints either "is the latest version" or a warning with the newer version number.

- [ ] **Step 4: Commit**

```bash
git add infra/docker-compose.localstack.yml scripts/check-localstack-version.sh
git commit -m "chore: pin LocalStack to 4.14.0 and add version-check script"
```

---

### Task 2: Unified Docker Compose

**Files:**
- Create: `docker-compose.local.yml` (repo root)
- Modify: `package.json` (repo root)

- [ ] **Step 1: Create root docker-compose.local.yml**

Create `docker-compose.local.yml` at the repo root:

```yaml
# Unified local development stack: PostgreSQL + LocalStack
# Usage: pnpm local:up | pnpm local:down | pnpm local:fresh

services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_DB: racedash_local
      POSTGRES_USER: racedash
      POSTGRES_PASSWORD: racedash_local
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U racedash -d racedash_local"]
      interval: 1s
      timeout: 3s
      retries: 15
    volumes:
      - racedash-pg-data:/var/lib/postgresql/data

  localstack:
    image: localstack/localstack:4.14.0
    ports:
      - "4566:4566"
      - "4510-4559:4510-4559"
    environment:
      - SERVICES=s3,sqs,stepfunctions,lambda,ses,events,iam
      - DEBUG=0
      - DOCKER_HOST=unix:///var/run/docker.sock
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "./infra/localstack-init:/etc/localstack/init/ready.d"
      - "${LOCALSTACK_VOLUME_DIR:-localstack-data}:/var/lib/localstack"

volumes:
  racedash-pg-data:
  localstack-data:
```

- [ ] **Step 2: Verify the compose file is valid**

Run:
```bash
docker compose -f docker-compose.local.yml config --quiet
```

Expected: exits 0, no output (valid config).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.local.yml
git commit -m "feat: add unified docker-compose.local.yml with Postgres + LocalStack"
```

---

### Task 3: Make setup.sh Idempotent

**Files:**
- Modify: `infra/localstack-init/setup.sh`

The existing `setup.sh` uses `set -euo pipefail` but the `s3 mb` and `sqs create-queue` commands will fail if resources already exist (e.g., when LocalStack restarts with a persistent volume). Since we're introducing volume persistence via `local:up`, every create command must be idempotent.

- [ ] **Step 1: Add `2>/dev/null || true` to all create commands in setup.sh**

Update `infra/localstack-init/setup.sh` — change the S3 bucket creation lines:

```bash
# S3 Buckets
awslocal s3 mb s3://racedash-uploads-local --region "$REGION" 2>/dev/null || true
awslocal s3 mb s3://racedash-renders-local --region "$REGION" 2>/dev/null || true
```

Change the SQS DLQ creation:

```bash
# SQS DLQ
awslocal sqs create-queue \
  --queue-name racedash-social-upload-dlq-local \
  --region "$REGION" 2>/dev/null || true
```

Change the SQS queue creation:

```bash
# SQS Queue
awslocal sqs create-queue \
  --queue-name racedash-social-upload-local \
  --region "$REGION" \
  --attributes '{
    "VisibilityTimeout": "2700",
    "MessageRetentionPeriod": "345600",
    "RedrivePolicy": "{\"maxReceiveCount\":3,\"deadLetterTargetArn\":\"'"$DLQ_ARN"'\"}"
  }' 2>/dev/null || true
```

The SES verify and state machine creation already have `|| true`.

Note: the `DLQ_ARN` lookup on the line after `sqs create-queue` for the DLQ must still succeed. Since we added `|| true` to the create, the queue still exists (it just wasn't re-created). The `get-queue-attributes` call will work either way.

- [ ] **Step 2: Test idempotency — run setup.sh twice**

```bash
pnpm local:up
# Wait for ready, then manually re-run setup inside the container:
docker compose -f docker-compose.local.yml exec localstack bash /etc/localstack/init/ready.d/setup.sh
```

Expected: second run completes without errors, prints "LocalStack bootstrap complete".

- [ ] **Step 3: Commit**

```bash
git add infra/localstack-init/setup.sh
git commit -m "fix: make LocalStack setup.sh idempotent for persistent volume restarts"
```

---

### Task 4: Health-Check Wait Script

**Files:**
- Create: `scripts/wait-for-localstack.sh`

- [ ] **Step 1: Create the health-check wait script**

Create `scripts/wait-for-localstack.sh`:

```bash
#!/bin/bash
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
MAX_WAIT="${1:-90}"  # seconds, default 90
INTERVAL=2

# ── Pre-flight: is Docker running? ──────────────────────────────────────────
docker info >/dev/null 2>&1 || {
  echo "ERROR: Docker is not running. Please start Docker Desktop and try again."
  exit 1
}

echo "Waiting for LocalStack at $ENDPOINT (timeout: ${MAX_WAIT}s)..."

# ── Phase 1: Wait for services to report "running" ─────────────────────────
elapsed=0
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  status=$(curl -sf "$ENDPOINT/_localstack/health" 2>/dev/null) || true

  if [ -n "$status" ]; then
    all_ready=true
    for svc in s3 sqs stepfunctions ses; do
      svc_status=$(echo "$status" | python3 -c "
import sys, json
data = json.load(sys.stdin)
services = data.get('services', {})
print(services.get('$svc', 'missing'))
" 2>/dev/null) || true

      if [ "$svc_status" != "running" ] && [ "$svc_status" != "available" ]; then
        all_ready=false
        break
      fi
    done

    if [ "$all_ready" = true ]; then
      echo "  Services healthy (${elapsed}s)."
      break
    fi
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

if [ "$elapsed" -ge "$MAX_WAIT" ]; then
  echo "ERROR: LocalStack services did not become ready within ${MAX_WAIT}s."
  exit 1
fi

# ── Phase 2: Wait for init scripts to finish (resource verification) ────────
# The ready.d/setup.sh creates buckets, queues, and state machine.
# Services being "running" does NOT mean init scripts have completed.
echo "  Waiting for init resources (buckets, queues, state machine)..."

remaining=$((MAX_WAIT - elapsed))
while [ "$elapsed" -lt "$MAX_WAIT" ]; do
  # Check that the S3 uploads bucket exists (last resource created before SFN)
  bucket_check=$(aws --endpoint-url "$ENDPOINT" s3api head-bucket --bucket racedash-uploads-local 2>&1) && {
    # Also verify the state machine exists (created last in setup.sh)
    sm_check=$(aws --endpoint-url "$ENDPOINT" stepfunctions list-state-machines --query 'stateMachines[?name==`RenderPipeline-local`].name' --output text 2>/dev/null) || true
    if [ -n "$sm_check" ]; then
      echo "  Init resources ready (${elapsed}s total)."
      echo "LocalStack is ready."
      exit 0
    fi
  }

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
done

echo "ERROR: LocalStack init scripts did not complete within ${MAX_WAIT}s."
echo "  Check logs: pnpm local:logs:localstack"
exit 1
```

- [ ] **Step 2: Make it executable**

Run:
```bash
chmod +x scripts/wait-for-localstack.sh
```

- [ ] **Step 3: Test it (requires LocalStack running)**

Start LocalStack and then run:
```bash
docker compose -f docker-compose.local.yml up -d
./scripts/wait-for-localstack.sh
```

Expected: prints "Waiting for LocalStack..." then "LocalStack is ready (Ns)."

- [ ] **Step 4: Commit**

```bash
git add scripts/wait-for-localstack.sh
git commit -m "feat: add health-check based LocalStack readiness script"
```

---

### Task 5: Root-Level pnpm Scripts

**Files:**
- Modify: `package.json` (repo root)
- Modify: `infra/package.json`

- [ ] **Step 1: Add scripts to root package.json**

Add these scripts to the root `package.json` `"scripts"` object:

```json
"local:up": "docker compose -f docker-compose.local.yml up -d && ./scripts/wait-for-localstack.sh",
"local:down": "docker compose -f docker-compose.local.yml down",
"local:fresh": "docker compose -f docker-compose.local.yml down -v && docker compose -f docker-compose.local.yml up -d && ./scripts/wait-for-localstack.sh",
"local:logs": "docker compose -f docker-compose.local.yml logs -f",
"local:logs:localstack": "docker compose -f docker-compose.local.yml logs -f localstack",
"local:logs:postgres": "docker compose -f docker-compose.local.yml logs -f postgres",
"local:version-check": "./scripts/check-localstack-version.sh",
"local:ses": "./scripts/ses-inbox.sh",
"local:sfn:execute": "./scripts/sfn-execute.sh",
"setup:env": "tsx scripts/setup-env.ts"
```

- [ ] **Step 2: Update infra/package.json scripts**

Replace the localstack scripts in `infra/package.json`:

```json
"localstack:up": "docker compose -f docker-compose.localstack.yml up -d && ../scripts/wait-for-localstack.sh",
"localstack:down": "docker compose -f docker-compose.localstack.yml down",
"localstack:fresh": "docker compose -f docker-compose.localstack.yml down -v && docker compose -f docker-compose.localstack.yml up -d && ../scripts/wait-for-localstack.sh",
"localstack:reset": "pnpm localstack:down && pnpm localstack:up",
"localstack:logs": "docker compose -f docker-compose.localstack.yml logs -f",
"test:local": "pnpm localstack:up && pnpm localstack:env && dotenv -e .env.localstack -- jest --config jest.localstack.config.ts && pnpm localstack:down",
```

Note: removed `sleep 5` from `test:local` — the wait script handles readiness. Added `localstack:fresh` (wipes volumes) and `localstack:logs`.

- [ ] **Step 3: Verify scripts are valid JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('package.json'))"
node -e "JSON.parse(require('fs').readFileSync('infra/package.json'))"
```

Expected: exits 0, no output.

- [ ] **Step 4: Commit**

```bash
git add package.json infra/package.json
git commit -m "feat: add root-level local dev scripts and update infra scripts with health-check"
```

---

### Task 6: Interactive `.env.local` Setup Script

**Files:**
- Create: `scripts/setup-env.ts`

- [ ] **Step 1: Create the interactive env setup script**

Create `scripts/setup-env.ts`:

```typescript
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'

const ROOT = path.resolve(import.meta.dirname, '..')

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
```

- [ ] **Step 2: Verify script runs**

Run:
```bash
npx tsx scripts/setup-env.ts
```

Expected: Interactive prompts appear. LocalStack vars are auto-populated. Pressing Enter accepts defaults. Output file is written to `apps/api/.env.local`.

- [ ] **Step 3: Add .env.local to .gitignore if not already present**

Check and add if needed:
```bash
grep -qxF '.env.local' .gitignore || echo '.env.local' >> .gitignore
```

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-env.ts .gitignore
git commit -m "feat: add interactive .env.local setup script"
```

---

### Task 7: SES Inbox Inspector Script

**Files:**
- Create: `scripts/ses-inbox.sh`

- [ ] **Step 1: Create the SES inbox script**

Create `scripts/ses-inbox.sh`:

```bash
#!/bin/bash
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"

usage() {
  echo "Usage: ses-inbox.sh [options]"
  echo ""
  echo "Query LocalStack SES sent messages."
  echo ""
  echo "Options:"
  echo "  --from <email>    Filter by sender email"
  echo "  --id <id>         Get a specific message by ID"
  echo "  --clear           Delete all sent messages"
  echo "  -h, --help        Show this help"
  echo ""
  echo "Examples:"
  echo "  pnpm local:ses                          # List all sent emails"
  echo "  pnpm local:ses -- --from test@racedash.local"
  echo "  pnpm local:ses -- --clear"
}

FILTER=""
ACTION="list"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)  [[ $# -ge 2 ]] || { echo "ERROR: --from requires an email argument"; exit 1; }; FILTER="?email=$2"; shift 2 ;;
    --id)    [[ $# -ge 2 ]] || { echo "ERROR: --id requires a message ID argument"; exit 1; }; FILTER="?id=$2"; shift 2 ;;
    --clear) ACTION="clear"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$ACTION" = "clear" ]; then
  curl -sf -X DELETE "$ENDPOINT/_aws/ses" >/dev/null || {
    echo "ERROR: Could not reach LocalStack at $ENDPOINT. Is it running?"
    exit 1
  }
  echo "Cleared all sent emails."
  exit 0
fi

response=$(curl -sf "$ENDPOINT/_aws/ses${FILTER}" 2>/dev/null) || {
  echo "ERROR: Could not reach LocalStack at $ENDPOINT. Is it running?"
  exit 1
}

# Pretty-print with summary
echo "$response" | python3 -c "
import sys, json

data = json.load(sys.stdin)
messages = data.get('messages', [])

if not messages:
    print('No emails found.')
    sys.exit(0)

print(f'Found {len(messages)} email(s):\n')

for i, msg in enumerate(messages, 1):
    to_addrs = ', '.join(msg.get('Destination', {}).get('ToAddresses', ['?']))
    print(f'  [{i}] {msg.get(\"Source\", \"?\")} → {to_addrs}')
    print(f'      Subject: {msg.get(\"Subject\", \"(no subject)\")}')
    print(f'      Date:    {msg.get(\"Timestamp\", \"?\")}')
    print(f'      ID:      {msg.get(\"Id\", \"?\")}')
    body = msg.get('Body', {})
    text = body.get('text_part') or body.get('html_part') or '(empty)'
    preview = text[:120].replace('\n', ' ')
    if len(text) > 120:
        preview += '...'
    print(f'      Body:    {preview}')
    print()
"
```

- [ ] **Step 2: Make executable and test**

Run:
```bash
chmod +x scripts/ses-inbox.sh
```

Test (requires LocalStack running):
```bash
./scripts/ses-inbox.sh
```

Expected: prints "No emails found." or a list of sent emails.

- [ ] **Step 3: Commit**

```bash
git add scripts/ses-inbox.sh
git commit -m "feat: add SES inbox inspector script for local development"
```

---

### Task 8: Step Functions Execution Script

**Files:**
- Create: `scripts/sfn-execute.sh`

- [ ] **Step 1: Create the Step Functions execution script**

Create `scripts/sfn-execute.sh`:

```bash
#!/bin/bash
set -euo pipefail

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
REGION="${AWS_REGION:-us-east-1}"
STATE_MACHINE_ARN="${STEP_FUNCTIONS_STATE_MACHINE_ARN:-arn:aws:states:us-east-1:000000000000:stateMachine:RenderPipeline-local}"
POLL_INTERVAL=3
MAX_POLL=300  # 5 minutes default

usage() {
  echo "Usage: sfn-execute.sh [options]"
  echo ""
  echo "Start a Step Functions execution on LocalStack and tail its status."
  echo ""
  echo "Options:"
  echo "  --input <json>     JSON input for the execution (default: sample render job)"
  echo "  --arn <arn>        State machine ARN (default: RenderPipeline-local)"
  echo "  --status <id>     Just check status of an existing execution ARN"
  echo "  --list             List recent executions"
  echo "  -h, --help         Show this help"
  echo ""
  echo "Examples:"
  echo "  pnpm local:sfn:execute"
  echo "  pnpm local:sfn:execute -- --input '{\"jobId\":\"test-1\",\"userId\":\"user-1\"}'"
  echo "  pnpm local:sfn:execute -- --list"
}

AWS_CMD="aws --endpoint-url $ENDPOINT --region $REGION --no-cli-pager"

INPUT='{"jobId":"test-job-001","userId":"test-user-001"}'
ACTION="execute"
STATUS_ARN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)  [[ $# -ge 2 ]] || { echo "ERROR: --input requires a JSON argument"; exit 1; }; INPUT="$2"; shift 2 ;;
    --arn)    [[ $# -ge 2 ]] || { echo "ERROR: --arn requires an ARN argument"; exit 1; }; STATE_MACHINE_ARN="$2"; shift 2 ;;
    --status) [[ $# -ge 2 ]] || { echo "ERROR: --status requires an execution ARN"; exit 1; }; ACTION="status"; STATUS_ARN="$2"; shift 2 ;;
    --list)   ACTION="list"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$ACTION" = "list" ]; then
  echo "Recent executions for $STATE_MACHINE_ARN:"
  echo ""
  $AWS_CMD stepfunctions list-executions \
    --state-machine-arn "$STATE_MACHINE_ARN" \
    --max-results 10 \
    --query 'executions[].{Name:name,Status:status,Start:startDate}' \
    --output table
  exit 0
fi

if [ "$ACTION" = "status" ]; then
  $AWS_CMD stepfunctions describe-execution \
    --execution-arn "$STATUS_ARN" \
    --query '{Status:status,Input:input,Output:output,Error:error,Cause:cause,Start:startDate,Stop:stopDate}' \
    --output json | python3 -m json.tool
  exit 0
fi

# Start a new execution
EXEC_NAME="local-$(date +%s)"

echo "Starting execution: $EXEC_NAME"
echo "  State machine: $STATE_MACHINE_ARN"
echo "  Input: $INPUT"
echo ""

EXEC_RESULT=$($AWS_CMD stepfunctions start-execution \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --name "$EXEC_NAME" \
  --input "$INPUT" \
  --output json)

EXEC_ARN=$(echo "$EXEC_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['executionArn'])")

echo "  Execution ARN: $EXEC_ARN"
echo ""
echo "Polling status every ${POLL_INTERVAL}s (timeout: ${MAX_POLL}s)..."
echo ""

poll_elapsed=0
while [ "$poll_elapsed" -lt "$MAX_POLL" ]; do
  STATUS_JSON=$($AWS_CMD stepfunctions describe-execution \
    --execution-arn "$EXEC_ARN" \
    --output json)

  STATUS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")

  echo "  $(date +%H:%M:%S) — $STATUS"

  if [ "$STATUS" = "SUCCEEDED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "TIMED_OUT" ] || [ "$STATUS" = "ABORTED" ]; then
    echo ""
    echo "=== Final State ==="
    echo "$STATUS_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Status:  {data['status']}\")
if 'output' in data and data['output']:
    print(f\"Output:  {data['output'][:500]}\")
if 'error' in data and data['error']:
    print(f\"Error:   {data['error']}\")
if 'cause' in data and data['cause']:
    print(f\"Cause:   {data['cause'][:500]}\")
"
    exit 0
  fi

  sleep "$POLL_INTERVAL"
  poll_elapsed=$((poll_elapsed + POLL_INTERVAL))
done

echo ""
echo "ERROR: Execution did not complete within ${MAX_POLL}s. Last status: $STATUS"
echo "  Check with: $0 --status $EXEC_ARN"
exit 1
```

- [ ] **Step 2: Make executable**

Run:
```bash
chmod +x scripts/sfn-execute.sh
```

- [ ] **Step 3: Test listing (requires LocalStack running)**

Run:
```bash
./scripts/sfn-execute.sh --list
```

Expected: prints a table of executions (or empty table if none).

- [ ] **Step 4: Commit**

```bash
git add scripts/sfn-execute.sh
git commit -m "feat: add Step Functions execution and status script for local dev"
```

---

### Task 9: Integration — Verify End-to-End

- [ ] **Step 1: Start everything from root**

Run:
```bash
pnpm local:up
```

Expected: Docker starts both Postgres and LocalStack. The wait script polls and prints "LocalStack is ready (Ns)."

- [ ] **Step 2: Verify LocalStack resources**

Run:
```bash
aws --endpoint-url=http://localhost:4566 s3 ls
aws --endpoint-url=http://localhost:4566 sqs list-queues --output text
aws --endpoint-url=http://localhost:4566 stepfunctions list-state-machines --output text
```

Expected: 2 S3 buckets, 2 SQS queues, 1 state machine.

- [ ] **Step 3: Test the fresh/reset flow**

Run:
```bash
pnpm local:fresh
```

Expected: Containers stop, volumes are removed, containers restart fresh, LocalStack re-bootstraps all resources.

- [ ] **Step 4: Test persistent restart (no volume wipe)**

Run:
```bash
pnpm local:down
pnpm local:up
```

Expected: Containers restart. LocalStack volume persists — the init script runs again (idempotent via `2>/dev/null || true` on all create commands per Task 3). Resources should still exist.

- [ ] **Step 5: Run interactive env setup**

Run:
```bash
pnpm setup:env
```

Expected: Interactive prompts. LocalStack vars auto-filled. Outputs `apps/api/.env.local`.

- [ ] **Step 6: Run SES and SFN scripts**

Run:
```bash
pnpm local:ses
pnpm local:sfn:execute -- --list
```

Expected: SES shows "No emails found." SFN shows execution table.

- [ ] **Step 7: Run infra LocalStack tests**

Run:
```bash
cd infra && pnpm test:local
```

Expected: LocalStack integration tests pass without the old `sleep 5`.

- [ ] **Step 8: Run version check**

Run:
```bash
pnpm local:version-check
```

Expected: prints version status message.

- [ ] **Step 9: Commit any fixups from integration testing**

```bash
git add -A
git commit -m "fix: integration adjustments from end-to-end local dev testing"
```

(Only if changes were needed. Skip if everything worked first try.)
