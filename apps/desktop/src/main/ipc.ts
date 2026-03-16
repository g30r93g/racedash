import { ipcMain, app, dialog, shell } from 'electron'
import { execSync, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { FfmpegStatus, OpenFileOptions, OpenDirectoryOptions, VideoInfo } from '../types/ipc'
import type { ProjectData, CreateProjectOpts } from '../types/project'

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

  const entries = fs.readdirSync(racedashDir)
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
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    throw new Error('openProject: projectPath must be a non-empty string')
  }
  if (!projectPath.endsWith('project.json')) {
    throw new Error('openProject: path must point to a project.json file')
  }
  const raw = fs.readFileSync(projectPath, 'utf-8') as string
  return JSON.parse(raw) as ProjectData
}

export async function handleCreateProject(opts: CreateProjectOpts): Promise<ProjectData> {
  const slug = opts.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const saveDir = path.join(os.homedir(), 'Videos', 'racedash', slug)
  fs.mkdirSync(saveDir, { recursive: true })

  const projectPath = path.join(saveDir, 'project.json')

  const projectData: ProjectData = {
    name: opts.name,
    projectPath,
    videoPaths: opts.videoPaths,
    segments: opts.segments,
    selectedDriver: opts.selectedDriver,
  }

  // TODO: join video files with ffmpeg concat before saving
  fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2), 'utf-8')

  return projectData
}

/**
 * Reads basic video metadata from `videoPath` using ffprobe.
 *
 * Uses `execFileSync` with a discrete argument array — the video path is never
 * interpolated into a shell string, so there is no injection risk.
 *
 * Exported separately from the IPC handler so it can be unit-tested without
 * any Electron machinery.
 */
export function getVideoInfo(videoPath: string): VideoInfo {
  let stdout: Buffer
  try {
    stdout = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      videoPath,
    ]) as Buffer
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || message.toLowerCase().includes('not found')) {
      throw new Error(
        'ffprobe not found. Install ffmpeg (which bundles ffprobe) and ensure it is on your PATH.'
      )
    }
    throw err
  }

  const parsed = JSON.parse(stdout.toString()) as {
    streams: Array<{
      codec_type: string
      width?: number
      height?: number
      r_frame_rate: string
      duration: string
    }>
  }

  const videoStream = parsed.streams.find((s) => s.codec_type === 'video')
  if (!videoStream) {
    throw new Error(`No video stream found in ffprobe output for: ${videoPath}`)
  }

  const [numerator, denominator] = videoStream.r_frame_rate.split('/').map(Number)
  const fps = denominator !== 0 ? numerator / denominator : 0

  return {
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps,
    durationSeconds: parseFloat(videoStream.duration),
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
    if (typeof path !== 'string' || path.trim().length === 0) return
    if (!existsSync(path)) return
    shell.showItemInFolder(path)
  })

  // Projects
  ipcMain.handle('racedash:listProjects', () => listProjectsHandler())
  ipcMain.handle('racedash:openProject', (_event, projectPath: string) => openProjectHandler(projectPath))
  ipcMain.handle('racedash:createProject', (_event, opts: CreateProjectOpts) => handleCreateProject(opts))

  // Timing (stub — implemented in Timing tab sub-plan)
  ipcMain.handle('racedash:listDrivers',        stub('listDrivers'))
  ipcMain.handle('racedash:generateTimestamps', stub('generateTimestamps'))

  // Export
  ipcMain.handle('racedash:getVideoInfo',  (_event, videoPath: string) => getVideoInfo(videoPath))
  ipcMain.handle('racedash:startRender',   stub('startRender'))
  ipcMain.handle('racedash:cancelRender',  stub('cancelRender'))
}
