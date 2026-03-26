import { BrowserWindow, safeStorage, ipcMain, app } from 'electron'
import * as http from 'node:http'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { AuthSession } from '../types/ipc'

const SESSION_FILE = 'cloud-session.enc'
const API_URL = import.meta.env.VITE_API_URL ?? ''
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''
const CLERK_ACCOUNTS_URL = import.meta.env.VITE_CLERK_ACCOUNTS_URL ?? 'https://accounts.racedash.io'
const AUTH_CALLBACK_PORT = 19873

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
      let settled = false
      let server: http.Server | null = null

      const cleanup = (): void => {
        if (server) {
          server.close()
          server = null
        }
      }

      // Start a tiny HTTP server to catch the OAuth callback
      server = http.createServer(async (req, res) => {
        if (settled) return
        const url = new URL(req.url ?? '/', `http://localhost:${AUTH_CALLBACK_PORT}`)

        // Clerk redirects here after sign-in with a __clerk_status or session info
        // Extract the session token from the BrowserWindow cookies
        try {
          const cookies = await authWindow.webContents.session.cookies.get({})
          const sessionCookie = cookies.find(
            (c) => c.name === '__session' || c.name === '__clerk_db_jwt',
          )

          if (sessionCookie?.value) {
            const session = await fetchProfile(sessionCookie.value)
            if (session) {
              settled = true
              saveSession(session)
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end('<html><body><h2>Signed in! You can close this window.</h2><script>window.close()</script></body></html>')
              authWindow.close()
              cleanup()
              resolve(session)
              return
            }
          }

          res.writeHead(400, { 'Content-Type': 'text/html' })
          res.end('<html><body><h2>Sign-in failed. Please try again.</h2></body></html>')
        } catch {
          res.writeHead(500, { 'Content-Type': 'text/html' })
          res.end('<html><body><h2>An error occurred. Please try again.</h2></body></html>')
        }
      })

      server.listen(AUTH_CALLBACK_PORT)

      const callbackUrl = `http://localhost:${AUTH_CALLBACK_PORT}/callback`

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

      // Build the Clerk sign-in URL with localhost callback
      const signInUrl = `${CLERK_ACCOUNTS_URL}/sign-in?redirect_url=${encodeURIComponent(callbackUrl)}`
      authWindow.loadURL(signInUrl)

      authWindow.on('closed', () => {
        cleanup()
        if (!settled) {
          reject(new Error('Sign-in window was closed'))
        }
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
      await signOutWindow.loadURL(`${CLERK_ACCOUNTS_URL}/sign-out`)
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
