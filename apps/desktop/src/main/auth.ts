import { BrowserWindow, safeStorage, ipcMain, app } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'

const TOKEN_FILE = 'clerk-client.enc'

/** In-memory session JWT — the source of truth for API calls */
let sessionToken: string | null = null

function getTokenPath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE)
}

function persistClientToken(clientJwt: string): void {
  const encrypted = safeStorage.encryptString(clientJwt)
  fs.writeFileSync(getTokenPath(), encrypted)
}

function loadClientToken(): string | null {
  const tokenPath = getTokenPath()
  if (!fs.existsSync(tokenPath)) return null
  try {
    const encrypted = fs.readFileSync(tokenPath)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

function clearPersistedToken(): void {
  const tokenPath = getTokenPath()
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath)
  }
}

/** Called by auth-helpers.ts to get the current session JWT for API calls */
export function getSessionToken(): string | null {
  return sessionToken
}

export function registerTokenHandlers(mainWindow: BrowserWindow): void {
  // Renderer pushes session JWT (for API calls)
  ipcMain.on('racedash:auth:token:save:session', (_event, token: string) => {
    sessionToken = token
  })

  // Renderer pushes client JWT (for persistence across restarts)
  ipcMain.on('racedash:auth:token:save:client', (_event, token: string) => {
    persistClientToken(token)
  })

  // Renderer asks for cached client token on startup (to restore Clerk session)
  ipcMain.handle('racedash:auth:token:get', () => {
    return loadClientToken()
  })

  // Renderer tells main to clear everything on sign-out
  ipcMain.on('racedash:auth:token:clear', () => {
    sessionToken = null
    clearPersistedToken()
  })

  // Authenticated fetch — used by renderer for API calls via main process
  const API_URL = import.meta.env.VITE_API_URL ?? ''

  ipcMain.handle('racedash:auth:fetchWithAuth', async (_event, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`

    if (!fullUrl.startsWith(API_URL)) {
      throw new Error(`URL not allowed: ${fullUrl}`)
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    }

    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`
    }

    const response = await fetch(fullUrl, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
    })

    // Emit sessionExpired if API returns 401
    if (response.status === 401) {
      mainWindow.webContents.send('racedash:auth:sessionExpired')
    }

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    return {
      status: response.status,
      headers: responseHeaders,
      body: await response.text(),
    }
  })
}
