import { ipcMain } from 'electron'

const stub = (channel: string) => () => {
  throw new Error(`IPC handler not implemented: ${channel}`)
}

export function registerIpcHandlers(): void {
  ipcMain.handle('racedash:checkFfmpeg',        stub('checkFfmpeg'))
  ipcMain.handle('racedash:openFile',           stub('openFile'))
  ipcMain.handle('racedash:openFiles',          stub('openFiles'))
  ipcMain.handle('racedash:openDirectory',      stub('openDirectory'))
  ipcMain.handle('racedash:revealInFinder',     stub('revealInFinder'))
  ipcMain.handle('racedash:listDrivers',        stub('listDrivers'))
  ipcMain.handle('racedash:generateTimestamps', stub('generateTimestamps'))
  ipcMain.handle('racedash:getVideoInfo',       stub('getVideoInfo'))
  ipcMain.handle('racedash:startRender',        stub('startRender'))
  ipcMain.handle('racedash:cancelRender',       stub('cancelRender'))
}
