import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type {
  FfmpegStatus,
  OpenFileOptions,
  OpenDirectoryOptions,
  VideoInfo,
  MultiVideoInfo,
  RenderStartOpts,
  OutputResolution,
  DriversResult,
} from '../types/ipc'
import type { OverlayComponentsConfig, OverlayStyling, SessionSegment } from '@racedash/core'
import type { ProjectData, CreateProjectOpts, SegmentConfig as WizardSegmentConfig } from '../types/project'
import {
  joinVideos,
  listDrivers,
  generateTimestamps,
  renderSession,
  parseFpsValue,
  buildRaceLapSnapshots,
  buildSessionSegments,
  loadTimingConfig,
  resolveSegmentPositionOverrides,
  resolveTimingSegments,
} from '@racedash/engine'
import { getBundledToolPath, resolveFfprobeCommand } from './ffmpeg'
import { getRegistry, addToRegistry, removeFromRegistry, replaceInRegistry } from './projectRegistry'
import { registerCloudRenderHandlers } from './cloud-render-handlers'

// ---------------------------------------------------------------------------
// Exported implementation helpers (used by tests)
// ---------------------------------------------------------------------------

/**
 * Converts wizard SegmentConfig[] into the engine's config format.
 * Used by both handleCreateProject and updateProjectHandler.
 */
/**
 * Convert wizard-format segments to engine-format segments.
 *
 * @param videoFrameOffsets - Optional map from video index (in the project's
 *   videoPaths array) to cumulative start frame in the global timeline.
 *   When provided and a segment has `videoIndices`, the segment's
 *   `videoOffsetFrame` is shifted by the first assigned video's global offset
 *   so the engine sees a global frame number.
 */
export function buildEngineSegments(
  segments: WizardSegmentConfig[],
  selectedDrivers: Record<string, string>,
  videoFrameOffsets?: Map<number, number>,
): Record<string, unknown>[] {
  return segments.map((seg) => {
    let offsetFrame = seg.videoOffsetFrame ?? 0
    // Shift offset to global timeline when video index info is available
    if (videoFrameOffsets && seg.videoIndices && seg.videoIndices.length > 0) {
      const firstVideoIndex = seg.videoIndices[0]
      offsetFrame += videoFrameOffsets.get(firstVideoIndex) ?? 0
    }
    const base = {
      source: seg.source,
      mode: seg.session ?? 'race',
      offset: `${offsetFrame} F`,
      label: seg.label,
      driver: selectedDrivers[seg.label],
    }
    if (seg.source === 'alphaTiming') return { ...base, url: seg.url ?? '' }
    if (seg.source === 'daytonaEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'teamsportEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'mylapsSpeedhive')
      return { ...base, url: seg.url ?? `https://speedhive.mylaps.com/Sessions/${seg.eventId ?? ''}` }
    if (seg.source === 'manual') {
      if (!seg.timingData || seg.timingData.length === 0) {
        throw new Error(`Manual segment "${seg.label}" has no timing data`)
      }
      return { ...base, timingData: seg.timingData }
    }
    return base
  })
}

/**
 * Resolves remote timing sources and converts them to `cached` segments
 * that store the full resolved data (all drivers, grid, replay snapshots,
 * capabilities) inline. This avoids re-fetching on every project open.
 *
 * Manual and already-cached segments are returned unchanged. If resolution
 * fails for a remote segment, the original segment is returned so the
 * fetch will be retried when the project is opened.
 */
async function cacheRemoteTimingData(engineSegments: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  // Only resolve remote segments (not manual or cached) — manual segments
  // already contain their full data and don't need a network fetch or engine
  // validation round-trip.
  const remoteSegments = engineSegments.filter(
    (seg) => seg.source !== 'manual' && seg.source !== 'cached',
  )

  if (remoteSegments.length === 0) return engineSegments

  const tempPath = path.join(os.tmpdir(), `racedash-cache-${Date.now()}.json`)
  try {
    fs.writeFileSync(tempPath, JSON.stringify({ segments: remoteSegments }, null, 2), 'utf-8')

    const { segments: segmentConfigs } = await loadTimingConfig(tempPath, true)
    const resolved = await resolveTimingSegments(segmentConfigs)

    let remoteIndex = 0
    return engineSegments.map((original) => {
      const source = original.source as string
      if (source === 'manual' || source === 'cached') return original

      const seg = resolved[remoteIndex++]

      return {
        source: 'cached',
        mode: original.mode,
        offset: original.offset,
        label: original.label,
        driver: original.driver,
        positionOverrides: original.positionOverrides,
        originalSource: source,
        drivers: seg.drivers,
        capabilities: seg.capabilities,
        startingGrid: seg.startingGrid,
        replayData: seg.replayData,
      }
    })
  } catch (err) {
    console.error('[racedash] Failed to cache timing data, segments will fetch on open:', err)
    return engineSegments
  } finally {
    try {
      fs.unlinkSync(tempPath)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Checks whether ffmpeg is available on PATH.
 * Uses execSync with a hardcoded string — no user input, no injection risk.
 */
export function checkFfmpegImpl(): FfmpegStatus {
  const bundledPath = getBundledToolPath('ffmpeg')
  if (bundledPath) return { found: true, path: bundledPath }

  try {
    const lookupCommand = process.platform === 'win32' ? 'where.exe' : 'which'
    const raw = execFileSync(lookupCommand, ['ffmpeg']).toString().trim()
    const resolvedPath = raw.split(/\r?\n/)[0]?.trim()
    return resolvedPath ? { found: true, path: resolvedPath } : { found: false }
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

export async function listProjectsHandler(): Promise<ProjectData[]> {
  const paths = await getRegistry()
  const results = await Promise.all(
    paths.map(async (registeredPath): Promise<ProjectData | null> => {
      try {
        const raw = await fs.promises.readFile(registeredPath, 'utf-8')
        const parsed = JSON.parse(raw) as ProjectData
        if (typeof parsed.name !== 'string') return null
        const { missing: _stripped, ...data } = parsed as ProjectData & { missing?: unknown }
        return { ...data, projectPath: data.projectPath ?? registeredPath }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return {
            name: path.basename(path.dirname(registeredPath)) || registeredPath,
            projectPath: registeredPath,
            configPath: '',
            videoPaths: [],
            segments: [],
            selectedDrivers: {},
            missing: true,
          }
        }
        return null
      }
    }),
  )
  return results.filter((r): r is ProjectData => r !== null)
}

export interface ConfigPositionOverride {
  segmentIndex: number
  timestamp: string
  position: number
}

export function readProjectConfigHandler(configPath: string): Record<string, unknown> {
  if (typeof configPath !== 'string' || configPath.trim().length === 0) {
    throw new Error('readProjectConfig: configPath must be a non-empty string')
  }
  const raw = fs.readFileSync(configPath, 'utf-8') as string
  return JSON.parse(raw) as Record<string, unknown>
}

export async function updateProjectConfigOverridesHandler(
  configPath: string,
  overrides: ConfigPositionOverride[],
): Promise<void> {
  if (typeof configPath !== 'string' || configPath.trim().length === 0) {
    throw new Error('updateProjectConfigOverrides: configPath must be a non-empty string')
  }
  const raw = fs.readFileSync(configPath, 'utf-8') as string
  const config = JSON.parse(raw) as Record<string, unknown>
  const segments = (config.segments ?? []) as Record<string, unknown>[]

  // Clear existing positionOverrides on all segments
  for (const seg of segments) {
    delete seg.positionOverrides
  }

  // Group overrides by segment and sort ascending by frame number
  for (const seg of segments) {
    const idx = segments.indexOf(seg)
    const segOverrides = overrides
      .filter((o) => o.segmentIndex === idx)
      .sort((a, b) => {
        const frameA = parseInt(a.timestamp.replace(/\s*F$/i, ''), 10)
        const frameB = parseInt(b.timestamp.replace(/\s*F$/i, ''), 10)
        return frameA - frameB
      })
    if (segOverrides.length > 0) {
      seg.positionOverrides = segOverrides.map(({ timestamp, position }) => ({ timestamp, position }))
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export function saveStyleToConfigHandler(
  configPath: string,
  overlayType: string,
  styling: OverlayStyling,
  configOptions?: {
    boxPosition?: string
    qualifyingTablePosition?: string
    overlayComponents?: OverlayComponentsConfig
    segmentStyles?: Record<string, Partial<OverlayStyling>>
  },
): void {
  if (typeof configPath !== 'string' || configPath.trim().length === 0) {
    throw new Error('saveStyleToConfig: configPath must be a non-empty string')
  }
  const raw = fs.readFileSync(configPath, 'utf-8')
  const config = JSON.parse(raw) as Record<string, unknown>
  config.overlayType = overlayType
  config.styling = styling
  if (configOptions?.boxPosition !== undefined) {
    config.boxPosition = configOptions.boxPosition
  } else {
    delete config.boxPosition
  }
  if (configOptions?.qualifyingTablePosition !== undefined) {
    config.qualifyingTablePosition = configOptions.qualifyingTablePosition
  } else {
    delete config.qualifyingTablePosition
  }
  if (configOptions?.overlayComponents !== undefined) {
    config.overlayComponents = configOptions.overlayComponents
  } else {
    delete config.overlayComponents
  }
  if (configOptions?.segmentStyles !== undefined && Object.keys(configOptions.segmentStyles).length > 0) {
    config.segmentStyles = configOptions.segmentStyles
  } else {
    delete config.segmentStyles
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

export interface StylePreset {
  name: string
  overlayType: string
  styling: OverlayStyling
  overlayComponents?: OverlayComponentsConfig
}

export async function saveStylePresetHandler(
  preset: StylePreset,
  parentWindow?: BrowserWindow | null,
): Promise<string | null> {
  const result = await dialog.showSaveDialog(parentWindow ?? BrowserWindow.getFocusedWindow()!, {
    title: 'Save Style Preset',
    defaultPath: path.join(os.homedir(), `${preset.name || 'style-preset'}.json`),
    filters: [{ name: 'Style Preset', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null
  fs.writeFileSync(result.filePath, JSON.stringify(preset, null, 2), 'utf-8')
  return result.filePath
}

export async function loadStylePresetHandler(
  parentWindow?: BrowserWindow | null,
): Promise<StylePreset | null> {
  const result = await dialog.showOpenDialog(parentWindow ?? BrowserWindow.getFocusedWindow()!, {
    title: 'Load Style Preset',
    filters: [{ name: 'Style Preset', extensions: ['json'] }],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const raw = fs.readFileSync(result.filePaths[0], 'utf-8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (typeof parsed.overlayType !== 'string' || typeof parsed.styling !== 'object') {
    throw new Error('Invalid style preset file')
  }
  return parsed as unknown as StylePreset
}

export async function renameProjectHandler(projectPath: string, name: string): Promise<ProjectData> {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    throw new Error('renameProject: projectPath must be a non-empty string')
  }
  if (!projectPath.endsWith('project.json')) {
    throw new Error('renameProject: path must point to a project.json file')
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('renameProject: name must be a non-empty string')
  }
  const raw = fs.readFileSync(projectPath, 'utf-8') as string
  const project = JSON.parse(raw) as ProjectData
  const updated: ProjectData = {
    ...project,
    name: name.trim(),
    configPath: project.configPath ?? path.join(path.dirname(projectPath), 'config.json'),
  }
  fs.writeFileSync(projectPath, JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

export async function updateProjectHandler(
  projectPath: string,
  segments: WizardSegmentConfig[],
  selectedDrivers: Record<string, string>,
): Promise<ProjectData> {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    throw new Error('updateProject: projectPath must be a non-empty string')
  }
  if (!projectPath.endsWith('project.json')) {
    throw new Error('updateProject: path must point to a project.json file')
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('updateProject: segments must be a non-empty array')
  }
  if (selectedDrivers == null || typeof selectedDrivers !== 'object') {
    throw new Error('updateProject: selectedDrivers must be an object')
  }

  // Read existing project
  const raw = fs.readFileSync(projectPath, 'utf-8') as string
  const project = JSON.parse(raw) as ProjectData
  const configPath = project.configPath ?? path.join(path.dirname(projectPath), 'config.json')

  // Read existing config.json, preserve non-segment keys (styling, overrides, etc.)
  let existingConfig: Record<string, unknown> = {}
  try {
    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8') as string) as Record<string, unknown>
  } catch {
    /* config may not exist yet */
  }

  // Rebuild config with new segments + per-segment drivers, preserving other keys
  const engineSegments = buildEngineSegments(segments, selectedDrivers)
  const cachedSegments = await cacheRemoteTimingData(engineSegments)
  const updatedConfig = {
    ...existingConfig,
    segments: cachedSegments,
  }
  delete updatedConfig.driver
  fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8')

  // Update project.json
  const updatedProject: ProjectData = {
    ...project,
    segments,
    selectedDrivers,
    configPath,
  }
  fs.writeFileSync(projectPath, JSON.stringify(updatedProject, null, 2), 'utf-8')

  return updatedProject
}

export async function deleteProjectHandler(projectPath: string): Promise<void> {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    throw new Error('deleteProject: projectPath must be a non-empty string')
  }
  if (!projectPath.endsWith('project.json')) {
    throw new Error('deleteProject: path must point to a project.json file')
  }
  // Remove from registry first — abort if I/O fails (no-op if not found).
  await removeFromRegistry(projectPath)
  const projectDir = path.dirname(projectPath)
  await fs.promises.rm(projectDir, { recursive: true, force: true })
}

export async function relocateProjectHandler(oldProjectPath: string): Promise<ProjectData> {
  if (typeof oldProjectPath !== 'string') {
    throw new Error('relocateProject: oldProjectPath must be a string')
  }
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    filters: [{ name: 'RaceDash Project', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (canceled || filePaths.length === 0) {
    throw new Error('CANCELLED')
  }

  const newProjectPath = filePaths[0]

  const raw = await fs.promises.readFile(newProjectPath, 'utf-8')
  const parsed = JSON.parse(raw) as ProjectData
  if (typeof parsed.name !== 'string') {
    throw new Error('relocateProject: selected file is not a valid RaceDash project')
  }

  // Check not already registered under a different entry.
  const current = await getRegistry()
  if (newProjectPath !== oldProjectPath && current.includes(newProjectPath)) {
    throw new Error('ALREADY_REGISTERED')
  }

  try {
    await replaceInRegistry(oldProjectPath, newProjectPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'NOT_FOUND') {
      await addToRegistry(newProjectPath)
    } else {
      throw err
    }
  }

  const { missing: _stripped, ...data } = parsed as ProjectData & { missing?: unknown }
  return { ...data, projectPath: newProjectPath }
}

export async function openProjectHandler(projectPath: string): Promise<ProjectData> {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    throw new Error('openProject: projectPath must be a non-empty string')
  }
  if (!projectPath.endsWith('project.json')) {
    throw new Error('openProject: path must point to a project.json file')
  }
  const raw = fs.readFileSync(projectPath, 'utf-8') as string
  const project = JSON.parse(raw) as ProjectData
  // Older project.json files may not have configPath — derive it from the project directory.
  if (!project.configPath) {
    project.configPath = path.join(path.dirname(projectPath), 'config.json')
  }
  return project
}

export async function handleCreateProject(opts: CreateProjectOpts): Promise<ProjectData> {
  const slug = opts.name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const saveDir = opts.saveDir ?? path.join(os.homedir(), 'Videos', 'racedash', slug)

  // Prevent overwriting an existing non-empty directory
  if (fs.existsSync(saveDir)) {
    const entries = fs.readdirSync(saveDir)
    if (entries.length > 0) {
      throw new Error(`Save directory is not empty: ${saveDir}`)
    }
  }

  fs.mkdirSync(saveDir, { recursive: true })

  // No video file handling — source paths stored as-is

  // Compute cumulative frame offsets for each video in the global timeline.
  // This maps video index → start frame so segment offsets can be globalised.
  let videoFrameOffsets: Map<number, number> | undefined
  if (opts.videoPaths.length > 1) {
    try {
      const multiInfo = await getMultiVideoInfoImpl(opts.videoPaths)
      videoFrameOffsets = new Map<number, number>()
      for (let i = 0; i < multiInfo.files.length; i++) {
        videoFrameOffsets.set(i, Math.round(multiInfo.files[i].startSeconds * multiInfo.fps))
      }
    } catch (err) {
      console.warn('[createProject] Could not compute video frame offsets, using raw offsets:', err)
    }
  }

  // Write engine timing config (config.json) — segments in engine format.
  // For remote sources (alphaTiming, mylapsSpeedhive, etc.), resolve the timing data
  // now and save it as manual source to avoid re-fetching on every project open.
  const engineSegments = buildEngineSegments(opts.segments, opts.selectedDrivers, videoFrameOffsets)
  const cachedSegments = await cacheRemoteTimingData(engineSegments)

  const configPath = path.join(saveDir, 'config.json')
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        segments: cachedSegments,
      },
      null,
      2,
    ),
    'utf-8',
  )

  // Write app metadata (project.json) — wizard-format segments for UI display.
  const projectPath = path.join(saveDir, 'project.json')
  const projectData: ProjectData = {
    name: opts.name,
    projectPath,
    configPath,
    videoPaths: opts.videoPaths,
    segments: opts.segments,
    selectedDrivers: opts.selectedDrivers,
  }
  fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2), 'utf-8')

  // Register the project so it appears in the library regardless of saveDir location.
  try {
    await addToRegistry(projectPath)
  } catch (err) {
    // Roll back the two files we wrote. Do not remove saveDir itself — it may pre-exist.
    await Promise.allSettled([
      fs.promises.unlink(path.join(saveDir, 'project.json')),
      fs.promises.unlink(path.join(saveDir, 'config.json')),
    ])
    throw err
  }

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
  // Guard: ensure the file exists and is locally available.
  // iCloud/cloud placeholders are tiny stubs (< 1KB) that can cause ffprobe
  // to hang or return invalid data.
  try {
    fs.accessSync(videoPath, fs.constants.R_OK)
    const stat = fs.statSync(videoPath)
    if (stat.size < 1024) {
      throw new Error(
        `File appears to be a cloud storage placeholder (${stat.size} bytes). Download it locally first: ${videoPath}`,
      )
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('cloud storage placeholder')) throw err
    throw new Error(`File not accessible: ${videoPath}`)
  }

  let stdout: Buffer
  try {
    stdout = execFileSync(resolveFfprobeCommand(), [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      videoPath,
    ], { timeout: 10_000 }) as Buffer
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const code = (err as NodeJS.ErrnoException).code
    const signal = (err as { signal?: string }).signal
    if (code === 'ENOENT' || message.toLowerCase().includes('not found')) {
      throw new Error('ffprobe not found. Install ffmpeg (which bundles ffprobe) and ensure it is on your PATH.')
    }
    if (signal === 'SIGINT' || signal === 'SIGTERM' || code === 'ETIMEDOUT') {
      throw new Error(
        `Could not read video file — it may still be downloading from cloud storage: ${videoPath}`,
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

export async function getMultiVideoInfoImpl(videoPaths: string[]): Promise<MultiVideoInfo> {
  if (videoPaths.length === 0) throw new Error('getMultiVideoInfo: at least one path required')

  const infos = await Promise.all(videoPaths.map((p) => getVideoInfo(p)))
  const fps = infos[0].fps

  let cumulative = 0
  const files = infos.map((info, i) => {
    const entry = { path: videoPaths[i], durationSeconds: info.durationSeconds, startSeconds: cumulative }
    cumulative += info.durationSeconds
    return entry
  })

  return {
    totalDurationSeconds: cumulative,
    fps,
    width: infos[0].width,
    height: infos[0].height,
    files,
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
    if (seg.source === 'mylapsSpeedhive')
      return { ...base, url: seg.url ?? `https://speedhive.mylaps.com/Sessions/${seg.eventId ?? ''}` }
    if (seg.source === 'manual') return { ...base, timingData: seg.timingData ?? [] }
    return base
  })

  const tempPath = path.join(os.tmpdir(), `racedash-preview-${Date.now()}.json`)
  try {
    fs.writeFileSync(tempPath, JSON.stringify({ segments: engineSegments }, null, 2), 'utf-8')
    return (await listDrivers({ configPath: tempPath })) as DriversResult
  } finally {
    try {
      fs.unlinkSync(tempPath)
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// previewTimestamps — wizard helper
// ---------------------------------------------------------------------------

export interface LapPreview {
  number: number
  /** Individual lap duration in seconds. */
  lapTime: number
  /** Race position after this lap. Undefined for practice/qualifying. */
  position?: number
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
  selectedDrivers: Record<string, string>,
): Promise<PreviewTimestampsSegment[]> {
  // Manual segments are resolved client-side in LapTimeVerifyTable — filter
  // them out to avoid engine validation failures on the temp config file.
  const fetchable = segments.filter((s) => s.source !== 'manual')
  if (fetchable.length === 0) return []

  const engineSegments = fetchable.map((seg) => {
    const base = {
      source: seg.source,
      mode: seg.session ?? 'race',
      offset: '00:00:00',
      label: seg.label,
      driver: selectedDrivers[seg.label],
    }
    if (seg.source === 'alphaTiming') return { ...base, url: seg.url ?? '' }
    if (seg.source === 'daytonaEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'teamsportEmail') return { ...base, emailPath: seg.emailPath ?? '' }
    if (seg.source === 'mylapsSpeedhive')
      return { ...base, url: seg.url ?? `https://speedhive.mylaps.com/Sessions/${seg.eventId ?? ''}` }
    return base
  })

  const tempPath = path.join(os.tmpdir(), `racedash-preview-ts-${Date.now()}.json`)
  try {
    fs.writeFileSync(tempPath, JSON.stringify({ segments: engineSegments }, null, 2), 'utf-8')
    const result = await generateTimestamps({ configPath: tempPath })
    type RawSeg = {
      config: { label?: string; source: string; mode: string }
      selectedDriver?: { kart: string; laps: Array<{ number: number; lapTime: number }> }
      replayData?: Parameters<typeof buildRaceLapSnapshots>[0]
      drivers?: Array<{ kart: string; laps: Array<{ lapTime: number }> }>
    }
    return (result.segments as RawSeg[]).map((seg) => {
      const rawLaps = seg.selectedDriver?.laps ?? []
      const isRace = seg.config.mode === 'race'

      let laps: LapPreview[]
      if (isRace && seg.replayData && seg.selectedDriver) {
        const snapshots = buildRaceLapSnapshots(seg.replayData, 0)
        const kart = seg.selectedDriver.kart
        laps = rawLaps.map((lap) => {
          const snapshot = snapshots.find((s) =>
            s.entries.some((e) => e.kart === kart && e.lapsCompleted === lap.number),
          )
          const entry = snapshot?.entries.find((e) => e.kart === kart)
          return { ...lap, position: entry?.position }
        })
      } else {
        // Practice / qualifying — rank each lap by time across all drivers' best laps
        const allBestByDriver = (seg.drivers ?? [])
          .map((d) => Math.min(...d.laps.map((l) => l.lapTime)))
          .filter(isFinite)
          .sort((a, b) => a - b)
        laps = rawLaps.map((lap) => {
          const rank = allBestByDriver.findIndex((t) => t >= lap.lapTime)
          return { ...lap, position: rank >= 0 ? rank + 1 : undefined }
        })
      }

      return { label: seg.config.label ?? seg.config.source, laps }
    })
  } finally {
    try {
      fs.unlinkSync(tempPath)
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// generateTimestampsHandler — extends engine result with session segments
// ---------------------------------------------------------------------------

// Local type for the extended handler return — avoids `as never` and keeps TS honest
type GenerateTimestampsHandlerResult = Awaited<ReturnType<typeof generateTimestamps>> & {
  sessionSegments: SessionSegment[]
  startingGridPosition?: number
}

export async function generateTimestampsHandler(opts: {
  configPath: string
  fps?: number
}): Promise<GenerateTimestampsHandlerResult> {
  const result = await generateTimestamps(opts)
  const { segments: sessionSegments, startingGridPosition } = buildSessionSegments(result.segments, result.offsets)

  // Attach position overrides to session segments (mirrors renderSession in operations.ts)
  const { segments: segmentConfigs } = await loadTimingConfig(opts.configPath, true)
  sessionSegments.forEach((seg, index) => {
    seg.positionOverrides = resolveSegmentPositionOverrides(
      segmentConfigs[index],
      result.segments[index],
      result.offsets[index],
      index,
      opts.fps,
    )
  })

  return { ...result, sessionSegments, startingGridPosition }
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
  ipcMain.handle('racedash:deleteProject', (_event, projectPath: string) => deleteProjectHandler(projectPath))
  ipcMain.handle('racedash:relocateProject', (_event, oldProjectPath: string) => relocateProjectHandler(oldProjectPath))
  ipcMain.handle('racedash:renameProject', (_event, projectPath: string, name: string) =>
    renameProjectHandler(projectPath, name),
  )
  ipcMain.handle(
    'racedash:updateProject',
    (_event, projectPath: string, segments: WizardSegmentConfig[], selectedDrivers: Record<string, string>) =>
      updateProjectHandler(projectPath, segments, selectedDrivers),
  )
  ipcMain.handle('racedash:readProjectConfig', (_event, configPath: string) => readProjectConfigHandler(configPath))
  ipcMain.handle(
    'racedash:updateProjectConfigOverrides',
    (_event, configPath: string, overrides: ConfigPositionOverride[]) =>
      updateProjectConfigOverridesHandler(configPath, overrides),
  )
  ipcMain.handle(
    'racedash:saveStyleToConfig',
    (
      _event,
      configPath: string,
      overlayType: string,
      styling: OverlayStyling,
      configOptions?: {
        boxPosition?: string
        qualifyingTablePosition?: string
        overlayComponents?: OverlayComponentsConfig
        segmentStyles?: Record<string, Partial<OverlayStyling>>
      },
    ) => saveStyleToConfigHandler(configPath, overlayType, styling, configOptions),
  )
  ipcMain.handle('racedash:saveStylePreset', (_event, preset: StylePreset) => saveStylePresetHandler(preset))
  ipcMain.handle('racedash:loadStylePreset', () => loadStylePresetHandler())

  // Timing — engine integration
  ipcMain.handle('racedash:previewDrivers', (_event, segments: WizardSegmentConfig[]) => previewDriversImpl(segments))
  ipcMain.handle(
    'racedash:previewTimestamps',
    (_event, segments: WizardSegmentConfig[], selectedDrivers: Record<string, string>) =>
      previewTimestampsImpl(segments, selectedDrivers),
  )
  ipcMain.handle('racedash:listDrivers', (_event, opts: { configPath: string; driverQuery?: string }) =>
    listDrivers(opts),
  )
  ipcMain.handle('racedash:generateTimestamps', (_event, opts: { configPath: string; fps?: number }) =>
    generateTimestampsHandler(opts),
  )

  // Export — getVideoInfo (synchronous, uses execFileSync)
  ipcMain.handle('racedash:getVideoInfo', (_event, videoPath: string) => getVideoInfo(videoPath))
  ipcMain.handle('racedash:getMultiVideoInfo', (_event, videoPaths: string[]) => getMultiVideoInfoImpl(videoPaths))

  // Lightweight file validation — checks accessibility without running ffprobe.
  // Returns { available: string[], unavailable: string[] }
  ipcMain.handle('racedash:validateVideoPaths', (_event, videoPaths: string[]) => {
    const available: string[] = []
    const unavailable: string[] = []
    for (const p of videoPaths) {
      try {
        fs.accessSync(p, fs.constants.R_OK)
        const stat = fs.statSync(p)
        if (stat.size < 1024) {
          unavailable.push(p)
        } else {
          available.push(p)
        }
      } catch {
        unavailable.push(p)
      }
    }
    return { available, unavailable }
  })

  // Export — startRender (non-blocking; progress pushed via webContents.send)
  ipcMain.handle('racedash:startRender', (event, opts: RenderStartOpts) => {
    activeRenderCancelled = false
    activeRenderSender = event.sender

    const outputResolution = opts.outputResolution === 'source' ? undefined : RESOLUTION_MAP[opts.outputResolution]

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

  // Cloud render handlers
  registerCloudRenderHandlers()
}
