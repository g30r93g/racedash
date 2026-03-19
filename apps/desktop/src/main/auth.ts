import { BrowserWindow, safeStorage, ipcMain, app } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { AuthSession } from '../types/ipc'

const SESSION_FILE = 'cloud-session.enc'
const API_URL = process.env.VITE_API_URL ?? ''
const CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''

function getSessionPath(): string {
  return path.join(app.getPath('userData'), SESSION_FILE)
}

function saveSession(session: AuthSession): void {
  const json = JSON.stringify(session)
  const encrypted = safeStorage.encryptString(json)
  fs.writeFileSync(getSessionPath(), encrypted)
}

function loadSession(): AuthSession | null {
  const sessionPath = getSessionPath()
  if (!fs.existsSync(sessionPath)) return null
  try {
    const encrypted = fs.readFileSync(sessionPath)
    const json = safeStorage.decryptString(encrypted)
    return JSON.parse(json) as AuthSession
  } catch {
    // Corrupted or unreadable — clear it
    clearSession()
    return null
  }
}

function clearSession(): void {
  const sessionPath = getSessionPath()
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath)
  }
}

async function fetchProfile(token: string): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return null
    const data = await response.json()
    return {
      user: data.user,
      license: data.license,
      token,
    }
  } catch {
    return null
  }
}

export function registerAuthHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('racedash:auth:signIn', async () => {
    return new Promise<AuthSession>((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        parent: mainWindow,
        modal: true,
        title: 'Sign in to RaceDash Cloud',
        webPreferences: {
          nodeIntegration: false,
          sandbox: true,
          partition: 'persist:clerk-auth',
        },
      })

      // Build the Clerk sign-in URL
      const signInUrl = `https://accounts.racedash.com/sign-in?redirect_url=racedash://auth/callback`
      authWindow.loadURL(signInUrl)

      // Listen for the redirect back to racedash://
      authWindow.webContents.on('will-navigate', async (_event, url) => {
        if (url.startsWith('racedash://auth/callback')) {
          const hashParams = new URLSearchParams(url.split('#')[1] ?? '')
          const token = hashParams.get('session_token')

          if (token) {
            const session = await fetchProfile(token)
            if (session) {
              saveSession(session)
              authWindow.close()
              resolve(session)
              return
            }
          }

          authWindow.close()
          reject(new Error('Failed to obtain session'))
        }
      })

      authWindow.on('closed', () => {
        reject(new Error('Sign-in window was closed'))
      })
    })
  })

  ipcMain.handle('racedash:auth:signOut', async () => {
    // Open hidden window to Clerk sign-out URL
    const signOutWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        partition: 'persist:clerk-auth',
      },
    })

    try {
      await signOutWindow.loadURL('https://accounts.racedash.com/sign-out')
      // Wait briefly for sign-out to process
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch {
      // Sign-out URL might fail if offline — proceed with local cleanup
    } finally {
      signOutWindow.close()
    }

    clearSession()

    // Clear the clerk-auth session cookies
    const session = mainWindow.webContents.session
    const cookies = await session.cookies.get({ name: 'persist:clerk-auth' })
    for (const cookie of cookies) {
      const url = `https://${cookie.domain}${cookie.path}`
      await session.cookies.remove(url, cookie.name)
    }
  })

  ipcMain.handle('racedash:auth:getSession', async () => {
    return loadSession()
  })

  ipcMain.handle('racedash:auth:fetchWithAuth', async (_event, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    // Validate URL against allowlist
    if (!url.startsWith(API_URL)) {
      throw new Error(`URL not allowed: ${url}`)
    }

    const session = loadSession()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    }

    if (session?.token) {
      headers['Authorization'] = `Bearer ${session.token}`
    }

    const response = await fetch(url, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body,
    })

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
