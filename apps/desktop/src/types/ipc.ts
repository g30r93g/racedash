import type { ProjectData, CreateProjectOpts } from './project'

// File dialog options
export interface OpenFileOptions {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  defaultPath?: string
}

export interface OpenDirectoryOptions {
  title?: string
  defaultPath?: string
}

// FFmpeg
export interface FfmpegStatus {
  found: boolean
  path?: string
}

// Video info (populated by Export tab sub-plan)
export interface VideoInfo {
  width: number
  height: number
  fps: number
  durationSeconds: number
}

// Timing (mirrors @racedash/engine — kept in sync manually)
export interface DriversResult {
  segments: Array<{
    config: { source: string; mode: string; label?: string }
    capabilities: Record<string, boolean>
    drivers: Array<{ kart: string; name: string }>
  }>
  driverListsIdentical: boolean
}

export interface TimestampsResult {
  chapters: string
  segments: Array<{
    config: { source: string; mode: string; label?: string }
    selectedDriver?: { name: string; kart: string; laps: unknown[] }
    capabilities: Record<string, boolean>
  }>
  offsets: number[]
}

// Render (populated by Export tab sub-plan)
export type OutputResolution = 'source' | '1080p' | '1440p' | '2160p'
export type OutputFrameRate = 'source' | '30' | '60' | '120'
export type RenderMode = 'overlay+footage' | 'overlay-only'

export interface RenderStartOpts {
  configPath: string
  videoPaths: string[]
  outputPath: string
  style: string
  outputResolution: OutputResolution
  outputFrameRate: OutputFrameRate
  renderMode: RenderMode
}

export interface RenderCompleteResult {
  outputPath: string
  overlayReused: boolean
}

// The full window.racedash API surface.
// All methods are stubbed in the scaffold; sub-plans implement each section.
export interface RacedashAPI {
  // System
  checkFfmpeg(): Promise<FfmpegStatus>

  // File dialogs
  openFile(opts?: OpenFileOptions): Promise<string | undefined>
  openFiles(opts?: OpenFileOptions): Promise<string[] | undefined>
  openDirectory(opts?: OpenDirectoryOptions): Promise<string | undefined>
  revealInFinder(path: string): Promise<void>

  // Projects
  listProjects(): Promise<ProjectData[]>
  openProject(projectPath: string): Promise<ProjectData>
  createProject(opts: CreateProjectOpts): Promise<ProjectData>

  // Engine — Timing tab (implemented in Timing tab sub-plan)
  listDrivers(opts: { configPath: string; driverQuery?: string }): Promise<DriversResult>
  generateTimestamps(opts: { configPath: string; fps?: number }): Promise<TimestampsResult>

  // Engine — Export tab (implemented in Export tab sub-plan)
  getVideoInfo(videoPath: string): Promise<VideoInfo>
  startRender(opts: RenderStartOpts): Promise<void>
  cancelRender(): Promise<void>

  // Render progress events — main → renderer push via ipcRenderer.on
  // Each returns a cleanup function that removes the listener.
  onRenderProgress(cb: (event: { phase: string; progress: number }) => void): () => void
  onRenderComplete(cb: (result: RenderCompleteResult) => void): () => void
  onRenderError(cb: (err: { message: string }) => void): () => void
}
