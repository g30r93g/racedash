import { app, BrowserWindow, protocol, net } from 'electron'
import path from 'node:path'
import { registerIpcHandlers } from './ipc'

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
  // Serve local files via media:// to bypass webSecurity origin restrictions.
  // Forward all request headers (including Range) so the video element gets
  // proper 206 partial-content responses needed for frame seeking.
  protocol.handle('media', (req) => {
    const filePath = decodeURIComponent(new URL(req.url).pathname)
    return net.fetch(`file://${filePath}`, {
      headers: Object.fromEntries(req.headers.entries()),
    })
  })
  registerIpcHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
