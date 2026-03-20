import { BrowserWindow, ipcMain } from 'electron'
import { loadSessionToken } from './auth-helpers'
import type { YouTubeConnectionStatus, YouTubeUploadMetadata, YouTubeUploadResult, SocialUploadStatus } from '../types/ipc'

const API_URL = process.env.VITE_API_URL ?? ''

function fetchWithSession(url: string, opts?: { method?: string; body?: string }): Promise<Response> {
  const token = loadSessionToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, {
    method: opts?.method ?? 'GET',
    headers,
    body: opts?.body,
  })
}

export function registerYouTubeHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('racedash:youtube:connect', async (): Promise<YouTubeConnectionStatus> => {
    return new Promise<YouTubeConnectionStatus>((resolve, reject) => {
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        parent: mainWindow,
        modal: true,
        title: 'Connect YouTube',
        webPreferences: {
          nodeIntegration: false,
          sandbox: true,
          partition: 'persist:youtube-oauth',
        },
      })

      authWindow.loadURL(`${API_URL}/api/auth/youtube/connect`)

      // Detect success redirect
      authWindow.webContents.on('will-navigate', async (_event, url) => {
        if (url.includes('/auth/youtube/success')) {
          authWindow.close()
          // Fetch the connection status
          try {
            const response = await fetchWithSession(`${API_URL}/api/auth/youtube/status`)
            const data = await response.json()
            resolve(data as YouTubeConnectionStatus)
          } catch {
            resolve({ connected: true, account: null })
          }
        }
      })

      // Also detect did-navigate for the success page
      authWindow.webContents.on('did-navigate', async (_event, url) => {
        if (url.includes('/auth/youtube/success')) {
          authWindow.close()
          try {
            const response = await fetchWithSession(`${API_URL}/api/auth/youtube/status`)
            const data = await response.json()
            resolve(data as YouTubeConnectionStatus)
          } catch {
            resolve({ connected: true, account: null })
          }
        }
      })

      authWindow.on('closed', () => {
        // If window closed without success, return current status
        fetchWithSession(`${API_URL}/api/auth/youtube/status`)
          .then((r) => r.json())
          .then((data) => resolve(data as YouTubeConnectionStatus))
          .catch(() => resolve({ connected: false, account: null }))
      })
    })
  })

  ipcMain.handle('racedash:youtube:disconnect', async (): Promise<void> => {
    await fetchWithSession(`${API_URL}/api/auth/youtube/disconnect`, { method: 'DELETE' })
  })

  ipcMain.handle('racedash:youtube:getStatus', async (): Promise<YouTubeConnectionStatus> => {
    const response = await fetchWithSession(`${API_URL}/api/auth/youtube/status`)
    if (!response.ok) return { connected: false, account: null }
    return response.json() as Promise<YouTubeConnectionStatus>
  })

  ipcMain.handle('racedash:youtube:upload', async (_event, jobId: string, metadata: YouTubeUploadMetadata): Promise<YouTubeUploadResult> => {
    // Validate jobId format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      throw new Error('Invalid job ID format')
    }

    const response = await fetchWithSession(`${API_URL}/api/jobs/${jobId}/social-upload`, {
      method: 'POST',
      body: JSON.stringify({ platform: 'youtube', metadata }),
    })

    if (!response.ok) {
      const error = await response.json() as { error: { code: string; message: string } }
      throw new Error(error.error?.message ?? `Upload failed: ${response.status}`)
    }

    const data = await response.json() as { socialUploadId: string; status: string; rcCost: number }
    return {
      socialUploadId: data.socialUploadId,
      status: 'queued',
      rcCost: data.rcCost,
    }
  })

  ipcMain.handle('racedash:youtube:getUploads', async (_event, jobId: string): Promise<SocialUploadStatus[]> => {
    const response = await fetchWithSession(`${API_URL}/api/jobs/${jobId}/social-uploads`)
    if (!response.ok) return []
    const data = await response.json() as { uploads: SocialUploadStatus[] }
    return data.uploads
  })
}
