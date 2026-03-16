import { ipcMain, dialog, shell } from 'electron'
import { execSync } from 'node:child_process'
import type { FfmpegStatus, OpenFileOptions, OpenDirectoryOptions } from '../types/ipc'

// ---------------------------------------------------------------------------
// Exported implementation helpers (used by tests)
// ---------------------------------------------------------------------------

/**
 * Checks whether ffmpeg is available on PATH.
 * Uses execSync with a hardcoded string — no user input, no injection risk.
 */
export function checkFfmpegImpl(): FfmpegStatus {
  try {
    const raw = execSync('which ffmpeg').toString().trim()
    return { found: true, path: raw }
  } catch {
    return { found: false }
  }
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const stub = (channel: string) => () => {
  throw new Error(`IPC handler not implemented: ${channel}`)
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerIpcHandlers(): void {
  // System
  ipcMain.handle('racedash:checkFfmpeg', () => checkFfmpegImpl())

  // File dialogs
  ipcMain.handle('racedash:openFile', async (_event, opts: OpenFileOptions = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      properties: ['openFile'],
    })
    return canceled ? undefined : filePaths[0]
  })

  ipcMain.handle('racedash:openFiles', async (_event, opts: OpenFileOptions = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts.title,
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      properties: ['openFile', 'multiSelections'],
    })
    return canceled ? undefined : filePaths
  })

  ipcMain.handle('racedash:openDirectory', async (_event, opts: OpenDirectoryOptions = {}) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: opts.title,
      defaultPath: opts.defaultPath,
      properties: ['openDirectory'],
    })
    return canceled ? undefined : filePaths[0]
  })

  ipcMain.handle('racedash:revealInFinder', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  // Projects (stubs — implemented in Project Library sub-plan)
  ipcMain.handle('racedash:listProjects',  stub('listProjects'))
  ipcMain.handle('racedash:openProject',   stub('openProject'))
  ipcMain.handle('racedash:createProject', stub('createProject'))

  // Timing (stub — implemented in Timing tab sub-plan)
  ipcMain.handle('racedash:listDrivers',        stub('listDrivers'))
  ipcMain.handle('racedash:generateTimestamps', stub('generateTimestamps'))

  // Export (stub — implemented in Export tab sub-plan)
  ipcMain.handle('racedash:getVideoInfo',  stub('getVideoInfo'))
  ipcMain.handle('racedash:startRender',   stub('startRender'))
  ipcMain.handle('racedash:cancelRender',  stub('cancelRender'))
}
