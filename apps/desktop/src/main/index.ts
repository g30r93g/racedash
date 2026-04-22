import { app, BrowserWindow, protocol, session as electronSession } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { configureBundledFfmpegPath } from './ffmpeg'
import { registerIpcHandlers } from './ipc'
import { registerUpdaterHandlers } from './updater'
import { registerTokenHandlers } from './auth'
import { registerStripeHandlers } from './stripe-checkout'
import { registerLicenseHandlers } from './license-handlers'
import { registerYouTubeHandlers } from './youtube'

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
  { scheme: 'racedash', privileges: { secure: true } },
])

app.setName('RaceDash')
if (!app.isPackaged) {
  app.setAppUserModelId('com.racedash.app')
}

function getDevIconPath(): string | undefined {
  if (app.isPackaged) return undefined

  const iconPath = path.join(app.getAppPath(), 'src/assets/logo.png')
  return fs.existsSync(iconPath) ? iconPath : undefined
}

function createWindow(): BrowserWindow {
  const devIconPath = getDevIconPath()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: process.platform === 'darwin' ? undefined : devIconPath,
    title: 'RaceDash',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false, // required for contextBridge preload; nodeIntegration remains false
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

/**
 * Stale-file extensions eligible for automatic cleanup.
 * Only files matching these extensions AND the racedash- prefix are removed.
 */
const STALE_TEMP_EXTENSIONS = new Set(['.mp4', '.txt'])

/**
 * Age threshold (in milliseconds) after which orphaned temp files are
 * considered stale and safe to delete. Files younger than this are left
 * alone because they may belong to an in-progress operation.
 */
const STALE_AGE_MS = 60 * 60 * 1000 // 1 hour

export async function cleanupStaleTempFiles(
  tempRoot: string = os.tmpdir(),
  prefix: string = 'racedash-',
  maxAgeMs: number = STALE_AGE_MS,
): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.promises.readdir(tempRoot)
  } catch {
    return
  }

  const now = Date.now()

  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix))
      .map(async (name) => {
        const targetPath = path.join(tempRoot, name)

        try {
          const stats = await fs.promises.lstat(targetPath)

          if (stats.isDirectory()) {
            // Remove empty directories (original behaviour)
            const children = await fs.promises.readdir(targetPath)
            if (children.length === 0) {
              await fs.promises.rmdir(targetPath)
            }
            return
          }

          // Remove stale files older than maxAgeMs
          const ext = path.extname(name).toLowerCase()
          if (!STALE_TEMP_EXTENSIONS.has(ext)) return

          const ageMs = now - stats.mtimeMs
          if (ageMs < maxAgeMs) return

          await fs.promises.unlink(targetPath)
        } catch {
          // Ignore races and permission issues in the shared temp directory.
        }
      }),
  )
}

app.whenReady().then(async () => {
  // Load React DevTools in development
  if (!app.isPackaged) {
    try {
      const devtools = await import('electron-devtools-installer')
      const installExtension = devtools.default ?? devtools
      const REACT_DEVELOPER_TOOLS = (devtools as Record<string, unknown>).REACT_DEVELOPER_TOOLS
      if (installExtension && REACT_DEVELOPER_TOOLS) {
        const ext = await (installExtension as Function)(REACT_DEVELOPER_TOOLS)
        console.log(`Loaded extension: ${ext?.name ?? ext}`)
      }
    } catch (err) {
      console.warn('Failed to install React DevTools:', err)
    }
  }

  // Clerk dev instances require third-party cookies (.clerk.accounts.dev
  // from localhost origin). Flush in-memory cookies to disk so they survive
  // between sessions.
  const ses = electronSession.defaultSession
  await ses.cookies.flushStore()

  configureBundledFfmpegPath()

  const devIconPath = getDevIconPath()
  if (process.platform === 'darwin' && devIconPath) {
    app.dock?.setIcon(devIconPath)
  }

  // Serve local video files via media:// with proper range request handling.
  // net.fetch('file://') does not guarantee 206 Partial Content responses,
  // which the browser requires for seeking. We handle byte ranges manually.
  protocol.handle('media', async (req) => {
    const filePath = decodeURIComponent(new URL(req.url).pathname)

    let stat: fs.Stats
    try {
      stat = fs.statSync(filePath)
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const fileSize = stat.size
    const rangeHeader = req.headers.get('range')

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      const start = match?.[1] ? parseInt(match[1], 10) : 0
      const end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1
      const chunkSize = end - start + 1

      const stream = fs.createReadStream(filePath, { start, end })
      return new Response(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(chunkSize),
          'Accept-Ranges': 'bytes',
        },
      })
    }

    const stream = fs.createReadStream(filePath)
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
      },
    })
  })
  void cleanupStaleTempFiles()
  registerIpcHandlers()
  const win = createWindow()
  registerTokenHandlers(win)
  registerLicenseHandlers(win)
  registerStripeHandlers(win)
  registerUpdaterHandlers(win)
  registerYouTubeHandlers(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
