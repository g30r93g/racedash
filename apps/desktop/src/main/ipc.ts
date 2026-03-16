import { ipcMain, app, dialog, shell } from 'electron'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import type { FfmpegStatus, OpenFileOptions, OpenDirectoryOptions } from '../types/ipc'
import type { ProjectData } from '../types/project'

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

/**
 * Resolved once at module load time.
 * Falls back to '' when app is not initialised (e.g. unit-test environments that
 * do not mock electron), in which case listProjectsHandler returns [] immediately.
 */
const RACEDASH_DIR: string = app?.getPath('home')
  ? path.join(app.getPath('home'), 'Videos', 'racedash')
  : ''

export function listProjectsHandler(): ProjectData[] {
  const racedashDir = RACEDASH_DIR
  if (!racedashDir || !fs.existsSync(racedashDir)) return []

  const entries = fs.readdirSync(racedashDir) as unknown as string[]
  const result: ProjectData[] = []

  for (const entry of entries) {
    const entryPath = path.join(racedashDir, entry)
    if (!fs.statSync(entryPath).isDirectory()) continue

    const projectJsonPath = path.join(entryPath, 'project.json')
    if (!fs.existsSync(projectJsonPath)) continue

    try {
      const raw = fs.readFileSync(projectJsonPath, 'utf-8')
      result.push(JSON.parse(raw) as ProjectData)
    } catch {
      // skip malformed entries
    }
  }

  return result
}

export async function openProjectHandler(projectPath: string): Promise<ProjectData> {
  const raw = fs.readFileSync(projectPath, 'utf-8')
  return JSON.parse(raw) as ProjectData
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
    if (typeof path !== 'string' || path.trim().length === 0) return
    if (!existsSync(path)) return
    shell.showItemInFolder(path)
  })

  // Projects
  ipcMain.handle('racedash:listProjects', () => listProjectsHandler())
  ipcMain.handle('racedash:openProject', (_event, projectPath: string) => openProjectHandler(projectPath))
  ipcMain.handle('racedash:createProject', stub('createProject'))

  // Timing (stub — implemented in Timing tab sub-plan)
  ipcMain.handle('racedash:listDrivers',        stub('listDrivers'))
  ipcMain.handle('racedash:generateTimestamps', stub('generateTimestamps'))

  // Export (stub — implemented in Export tab sub-plan)
  ipcMain.handle('racedash:getVideoInfo',  stub('getVideoInfo'))
  ipcMain.handle('racedash:startRender',   stub('startRender'))
  ipcMain.handle('racedash:cancelRender',  stub('cancelRender'))
}
