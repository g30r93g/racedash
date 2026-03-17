import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

function getRegistryPath(): string {
  return path.join(app.getPath('userData'), 'projects-registry.json')
}

// Serial queue — prevents concurrent reads/writes from racing.
let queue: Promise<void> = Promise.resolve()

export function _resetQueueForTesting(): void {
  queue = Promise.resolve()
}

function serialise<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn)
  queue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function readRegistry(): Promise<string[]> {
  try {
    const raw = await fs.promises.readFile(getRegistryPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

async function writeRegistry(paths: string[]): Promise<void> {
  await fs.promises.writeFile(getRegistryPath(), JSON.stringify(paths), 'utf-8')
}

export function getRegistry(): Promise<string[]> {
  return serialise(readRegistry)
}

export function addToRegistry(projectJsonPath: string): Promise<void> {
  return serialise(async () => {
    const current = await readRegistry()
    if (current.includes(projectJsonPath)) return
    await writeRegistry([...current, projectJsonPath])
  })
}

export function removeFromRegistry(projectJsonPath: string): Promise<void> {
  return serialise(async () => {
    const current = await readRegistry()
    const next = current.filter((p) => p !== projectJsonPath)
    if (next.length === current.length) return // not found — no-op
    await writeRegistry(next)
  })
}

export function replaceInRegistry(
  oldProjectPath: string,
  newProjectPath: string,
): Promise<void> {
  return serialise(async () => {
    const current = await readRegistry()
    const idx = current.indexOf(oldProjectPath)
    if (idx === -1) {
      throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
    }
    const next = [...current]
    next[idx] = newProjectPath
    await writeRegistry(next)
  })
}
