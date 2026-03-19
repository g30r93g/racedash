import { safeStorage, app } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { AuthSession } from '../types/ipc'

const SESSION_FILE = 'cloud-session.enc'

function getSessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILE)
}

export function loadSessionToken(): string | null {
  const sessionPath = getSessionPath()
  if (!fs.existsSync(sessionPath)) return null
  try {
    const encrypted = fs.readFileSync(sessionPath)
    const json = safeStorage.decryptString(encrypted)
    const session = JSON.parse(json) as AuthSession
    return session.token
  } catch {
    return null
  }
}
