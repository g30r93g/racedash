import { app, BrowserWindow, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { registerIpcHandlers } from './ipc'
import { registerUpdaterHandlers } from './updater'

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
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

app.whenReady().then(() => {
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
  registerIpcHandlers()
  const win = createWindow()
  registerUpdaterHandlers(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
