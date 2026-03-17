import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export function registerUpdaterHandlers(win: BrowserWindow): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('racedash:update-available', { version: info.version })
  })

  autoUpdater.on('update-downloaded', () => {
    win.webContents.send('racedash:update-downloaded')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err)
    win.webContents.send('racedash:update-error', { message: err.message })
  })

  ipcMain.handle('racedash:update-install', () => {
    autoUpdater.quitAndInstall()
  })

  autoUpdater.checkForUpdatesAndNotify()
}
