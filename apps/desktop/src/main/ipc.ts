import { ipcMain, app, dialog, shell } from 'electron'
import type { WebContents } from 'electron'
import { execSync, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { FfmpegStatus, OpenFileOptions, OpenDirectoryOptions, VideoInfo, RenderStartOpts, OutputResolution, JoinVideosResult, DriversResult } from '../types/ipc'
import type { ProjectData, CreateProjectOpts, SegmentConfig as WizardSegmentConfig } from '../types/project'
import { joinVideos, listDrivers, generateTimestamps, renderSession, parseFpsValue } from '@racedash/engine'

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
 * Joins multiple video chapter files into a single MP4 using the engine's
 * joinVideos (backed by @racedash/compositor).
 * For a single file, returns the original path with no work done.
 * For multiple files, writes the joined file to the system temp directory
 * and returns its path.
 */
export async function joinVideosImpl(videoPaths: string[]): Promise<string> {
  if (videoPaths.length === 0) throw new Error('joinVideos: at least one video path is required')
  if (videoPaths.length === 1) return videoPaths[0]

  const outPath = path.join(os.tmpdir(), `racedash-join-${Date.now()}.mp4`)
  await joinVideos(videoPaths, outPath)
  return outPath
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

  // Copy the joined video into the project directory.
  const videoPath = path.join(saveDir, 'video.mp4')
  fs.copyFileSync(opts.joinedVideoPath, videoPath)

  // Clean up the temp file if it came from os.tmpdir().
  // Use path.resolve to normalise symlinks (on macOS, os.tmpdir() returns
  // /private/tmp but the path may be seen as /tmp via the symlink).
  if (path.resolve(opts.joinedVideoPath).startsWith(path.resolve(os.tmpdir()))) {
    fs.unlinkSync(opts.joinedVideoPath)
  }

  // Write engine timing config (config.json) — segments in engine format.
  // Wizard segments lack `mode` and `offset`; derive them here.
  const engineSegments = opts.segments.map((seg) => {
    const base = {
      source: seg.source,
      mode: seg.session ?? 'race',
      offset: `${seg.videoOffsetFrame ?? 0} F`,
      label: seg.label,
    }
    if (seg.source === 'alphaTiming') return { ...base, url: seg.url ?? '' }
    if (seg.source === 'daytonaEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'teamsportEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'mylapsSpeedhive') return { ...base, url: seg.url ?? `https://speedhive.mylaps.com/Sessions/${seg.eventId ?? ''}` }
    if (seg.source === 'manual') return { ...base, timingData: [] }
    return base
  })

  const configPath = path.join(saveDir, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify({
    segments: engineSegments,
    driver: opts.selectedDriver || undefined,
  }, null, 2), 'utf-8')

  // Write app metadata (project.json) — wizard-format segments for UI display.
  const projectPath = path.join(saveDir, 'project.json')
  const projectData: ProjectData = {
    name: opts.name,
    projectPath,
    configPath,
    videoPaths: [videoPath],
    segments: opts.segments,
    selectedDriver: opts.selectedDriver,
  }
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
      avg_frame_rate: string
      r_frame_rate: string
      duration: string
    }>
  }

  const videoStream = parsed.streams.find((s) => s.codec_type === 'video')
  if (!videoStream) {
    throw new Error(`No video stream found in ffprobe output for: ${videoPath}`)
  }

  // Prefer avg_frame_rate (computed from timestamps, accurate for drop-frame like 29.97/59.94).
  // Fall back to r_frame_rate if avg_frame_rate is missing or 0/0.
  let fps: number
  try {
    fps = parseFpsValue(videoStream.avg_frame_rate, videoPath)
  } catch {
    fps = parseFpsValue(videoStream.r_frame_rate, videoPath)
  }

  return {
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps,
    durationSeconds: parseFloat(videoStream.duration),
  }
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

const RESOLUTION_MAP: Record<Exclude<OutputResolution, 'source'>, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
}

/**
 * Absolute path to the Remotion renderer entry point.
 * Resolved relative to this compiled file, which lives at apps/desktop/src/main/.
 * Four levels up reaches the monorepo root; then into apps/renderer/src/index.ts.
 */
const RENDERER_ENTRY = path.resolve(__dirname, '../../../../apps/renderer/src/index.ts')

// ---------------------------------------------------------------------------
// Active render state (one render at a time)
// ---------------------------------------------------------------------------

let activeRenderCancelled = false
let activeRenderSender: WebContents | null = null

// ---------------------------------------------------------------------------
// previewDrivers — wizard helper
// ---------------------------------------------------------------------------

/**
 * Lists drivers for wizard segments that haven't been saved to a project file yet.
 * Writes a temporary config file with placeholder `mode`/`offset` values (irrelevant
 * for driver discovery), calls listDrivers, then cleans up the temp file.
 */
export async function previewDriversImpl(segments: WizardSegmentConfig[]): Promise<DriversResult> {
  const engineSegments = segments.map((seg) => {
    const base = {
      source: seg.source,
      mode: seg.session ?? 'race',
      offset: '00:00:00',
      label: seg.label,
    }
    if (seg.source === 'alphaTiming') return { ...base, url: seg.url ?? '' }
    if (seg.source === 'daytonaEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'teamsportEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'mylapsSpeedhive') return { ...base, url: seg.url ?? `https://speedhive.mylaps.com/Sessions/${seg.eventId ?? ''}` }
    if (seg.source === 'manual') return { ...base, timingData: [] }
    return base
  })

  const tempPath = path.join(os.tmpdir(), `racedash-preview-${Date.now()}.json`)
  try {
    fs.writeFileSync(tempPath, JSON.stringify({ segments: engineSegments }, null, 2), 'utf-8')
    return await listDrivers({ configPath: tempPath }) as DriversResult
  } finally {
    try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// previewTimestamps — wizard helper
// ---------------------------------------------------------------------------

export interface LapPreview {
  number: number
  /** Individual lap duration in seconds. */
  lapTime: number
}

export interface PreviewTimestampsSegment {
  label: string
  laps: LapPreview[]
}

/**
 * Generates timestamps for wizard segments before a project is saved.
 * Writes a temporary config file with the selected driver, calls generateTimestamps,
 * then cleans up the temp file.
 */
export async function previewTimestampsImpl(
  segments: WizardSegmentConfig[],
  selectedDriver: string,
): Promise<PreviewTimestampsSegment[]> {
  const engineSegments = segments.map((seg) => {
    const base = {
      source: seg.source,
      mode: seg.session ?? 'race',
      offset: '00:00:00',
      label: seg.label,
    }
    if (seg.source === 'alphaTiming') return { ...base, url: seg.url ?? '' }
    if (seg.source === 'daytonaEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'teamsportEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'mylapsSpeedhive') return { ...base, url: seg.url ?? `https://speedhive.mylaps.com/Sessions/${seg.eventId ?? ''}` }
    if (seg.source === 'manual') return { ...base, timingData: [] }
    return base
  })

  const tempPath = path.join(os.tmpdir(), `racedash-preview-ts-${Date.now()}.json`)
  try {
    fs.writeFileSync(
      tempPath,
      JSON.stringify({ segments: engineSegments, driver: selectedDriver || undefined }, null, 2),
      'utf-8',
    )
    const result = await generateTimestamps({ configPath: tempPath })
    return (result.segments as Array<{ config: { label?: string; source: string }; selectedDriver?: { laps: LapPreview[] } }>)
      .map((seg) => ({
        label: seg.config.label ?? seg.config.source,
        laps: seg.selectedDriver?.laps ?? [],
      }))
  } finally {
    try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerIpcHandlers(): void {
  // System
  ipcMain.handle('racedash:checkFfmpeg', () => checkFfmpegImpl())
  ipcMain.handle('racedash:joinVideos', async (_event, videoPaths: string[]) => {
    const joinedPath = await joinVideosImpl(videoPaths)
    return { joinedPath }
  })

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

  ipcMain.handle('racedash:revealInFinder', (_event, filePath: string) => {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) return
    if (!existsSync(filePath)) return
    shell.showItemInFolder(filePath)
  })

  // Projects
  ipcMain.handle('racedash:listProjects', () => listProjectsHandler())
  ipcMain.handle('racedash:openProject', (_event, projectPath: string) => openProjectHandler(projectPath))
  ipcMain.handle('racedash:createProject', (_event, opts: CreateProjectOpts) => handleCreateProject(opts))

  // Timing — engine integration
  ipcMain.handle('racedash:previewDrivers', (_event, segments: WizardSegmentConfig[]) =>
    previewDriversImpl(segments)
  )
  ipcMain.handle('racedash:previewTimestamps', (_event, segments: WizardSegmentConfig[], selectedDriver: string) =>
    previewTimestampsImpl(segments, selectedDriver)
  )
  ipcMain.handle('racedash:listDrivers', (_event, opts: { configPath: string; driverQuery?: string }) =>
    listDrivers(opts)
  )
  ipcMain.handle('racedash:generateTimestamps', (_event, opts: { configPath: string; fps?: number }) =>
    generateTimestamps(opts)
  )

  // Export — getVideoInfo (synchronous, uses execFileSync)
  ipcMain.handle('racedash:getVideoInfo', (_event, videoPath: string) => getVideoInfo(videoPath))

  // Export — startRender (non-blocking; progress pushed via webContents.send)
  ipcMain.handle('racedash:startRender', (event, opts: RenderStartOpts) => {
    activeRenderCancelled = false
    activeRenderSender = event.sender

    const outputResolution =
      opts.outputResolution === 'source' ? undefined : RESOLUTION_MAP[opts.outputResolution]

    renderSession(
      {
        configPath: opts.configPath,
        videoPaths: opts.videoPaths,
        outputPath: opts.outputPath,
        rendererEntry: RENDERER_ENTRY,
        style: opts.style,
        outputResolution,
        onlyRenderOverlay: opts.renderMode === 'overlay-only',
      },
      (progress) => {
        if (activeRenderCancelled) {
          throw new Error('Render cancelled by user')
        }
        event.sender.send('racedash:render-progress', progress)
      },
    )
      .then((result) => {
        activeRenderSender = null
        event.sender.send('racedash:render-complete', result)
      })
      .catch((err: unknown) => {
        activeRenderSender = null
        const message = err instanceof Error ? err.message : String(err)
        event.sender.send('racedash:render-error', { message })
      })
  })

  // Export — cancelRender
  ipcMain.handle('racedash:cancelRender', () => {
    activeRenderCancelled = true
    if (activeRenderSender && !activeRenderSender.isDestroyed()) {
      activeRenderSender.send('racedash:render-error', { message: 'Render cancelled by user' })
    }
    activeRenderSender = null
  })
}
