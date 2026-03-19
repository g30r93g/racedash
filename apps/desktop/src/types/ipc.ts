import type { ProjectData, CreateProjectOpts, SegmentConfig } from './project'
import type { BoxPosition, CornerPosition, OverlayComponentsConfig, OverlayStyling, SessionSegment } from '@racedash/core'

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

// Video joining
export interface JoinVideosResult {
  /** Absolute path to the joined file. May be the original path (single file) or a temp path. */
  joinedPath: string
}

// Video info (populated by Export tab sub-plan)
export interface VideoInfo {
  width: number
  height: number
  fps: number
  durationSeconds: number
}

// Timing (mirrors @racedash/engine — kept in sync manually)
export interface LapPreview {
  number: number
  lapTime: number  // seconds
  position?: number
}

export interface PreviewTimestampsSegment {
  label: string
  laps: LapPreview[]
}

export interface DriversResult {
  segments: Array<{
    config: { source: string; mode: string; label?: string }
    capabilities: Record<string, boolean>
    drivers: Array<{ kart: string; name: string }>
  }>
  driverListsIdentical: boolean
}

export interface TimestampsResultLap {
  number: number
  lapTime: number    // seconds
  cumulative: number // seconds
}

export interface TimestampsResultDriver {
  kart: string
  name: string
  laps: TimestampsResultLap[]
}

export interface TimestampsResultReplayEntry {
  kart: string
  name: string
  position: number
  lapsCompleted: number
}

export interface TimestampsResult {
  chapters: string
  segments: Array<{
    config: { source: string; mode: string; label?: string }
    selectedDriver?: TimestampsResultDriver
    drivers: TimestampsResultDriver[]
    capabilities: Record<string, boolean>
    replayData?: TimestampsResultReplayEntry[][]
  }>
  offsets: number[]
  sessionSegments: SessionSegment[]          // pre-built by main process
  startingGridPosition?: number              // grid position for race-start display
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

// ── License types ─────────────────────────────────────────────────────────

export interface LicenseInfo {
  tier: 'plus' | 'pro'
  status: 'active'
  stripeSubscriptionId: string
  startsAt: string   // ISO 8601
  expiresAt: string  // ISO 8601
  maxConcurrentRenders: number
}

// ── Credit types ──────────────────────────────────────────────────────────

export interface CreditPack {
  id: string
  packName: string
  rcTotal: number
  rcRemaining: number
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditBalance {
  totalRc: number
  packs: CreditPack[]
}

export interface CreditPurchase {
  id: string
  packName: string
  rcTotal: number
  priceGbp: string     // decimal string, e.g. "9.99"
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditHistory {
  purchases: CreditPurchase[]
  nextCursor: string | null
}

// ── Stripe Checkout types ─────────────────────────────────────────────────

export interface StripeCheckoutResult {
  outcome: 'success' | 'cancelled'
  sessionId: string
}

// ── Auth types ────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string
}

export interface AuthLicense {
  tier: 'plus' | 'pro'
  status: 'active'
  expiresAt: string
}

export interface AuthSession {
  user: AuthUser
  license: AuthLicense | null
  token: string
}

export interface FetchWithAuthOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface FetchWithAuthResponse {
  status: number
  headers: Record<string, string>
  body: string
}

// The full window.racedash API surface.
// All methods are stubbed in the scaffold; sub-plans implement each section.
export interface RacedashAPI {
  // System
  checkFfmpeg(): Promise<FfmpegStatus>
  joinVideos(videoPaths: string[]): Promise<JoinVideosResult>

  // File dialogs
  openFile(opts?: OpenFileOptions): Promise<string | undefined>
  openFiles(opts?: OpenFileOptions): Promise<string[] | undefined>
  openDirectory(opts?: OpenDirectoryOptions): Promise<string | undefined>
  revealInFinder(path: string): Promise<void>

  // Projects
  listProjects(): Promise<ProjectData[]>
  openProject(projectPath: string): Promise<ProjectData>
  createProject(opts: CreateProjectOpts): Promise<ProjectData>
  deleteProject(projectPath: string): Promise<void>
  renameProject(projectPath: string, name: string): Promise<ProjectData>
  relocateProject(oldProjectPath: string): Promise<ProjectData>
  readProjectConfig(configPath: string): Promise<Record<string, unknown>>
  updateProjectConfigOverrides(configPath: string, overrides: Array<{ segmentIndex: number; timestamp: string; position: number }>): Promise<void>
  saveStyleToConfig(
    configPath: string,
    overlayType: string,
    styling: OverlayStyling,
    configOptions?: {
      boxPosition?: BoxPosition
      qualifyingTablePosition?: CornerPosition
      overlayComponents?: OverlayComponentsConfig
    },
  ): Promise<void>

  // Engine — Timing tab (implemented in Timing tab sub-plan)
  previewDrivers(segments: SegmentConfig[]): Promise<DriversResult>
  previewTimestamps(segments: SegmentConfig[], selectedDriver: string): Promise<PreviewTimestampsSegment[]>
  listDrivers(opts: { configPath: string; driverQuery?: string }): Promise<DriversResult>
  generateTimestamps(opts: { configPath: string; fps?: number }): Promise<TimestampsResult>

  // Engine — Export tab (implemented in Export tab sub-plan)
  getVideoInfo(videoPath: string): Promise<VideoInfo>
  startRender(opts: RenderStartOpts): Promise<void>
  cancelRender(): Promise<void>

  // Render progress events — main → renderer push via ipcRenderer.on
  // Each returns a cleanup function that removes the listener.
  onRenderProgress(cb: (event: { phase: string; progress: number; renderedFrames?: number; totalFrames?: number }) => void): () => void
  onRenderComplete(cb: (result: RenderCompleteResult) => void): () => void
  onRenderError(cb: (err: { message: string }) => void): () => void

  // Update events — main → renderer push via ipcRenderer.on
  // Each returns a cleanup function that removes the listener.
  onUpdateAvailable(cb: (info: { version: string }) => void): () => void
  onUpdateDownloaded(cb: () => void): () => void
  onUpdateError(cb: (err: { message: string }) => void): () => void

  // Trigger install — renderer → main
  installUpdate(): Promise<void>

  // Auth
  auth: {
    signIn(): Promise<AuthSession>
    signOut(): Promise<void>
    getSession(): Promise<AuthSession | null>
    fetchWithAuth(url: string, init?: FetchWithAuthOptions): Promise<FetchWithAuthResponse>
  }

  // License
  license: {
    get(): Promise<LicenseInfo | null>
    getCached(): Promise<LicenseInfo | null>
  }

  // Credits
  credits: {
    getBalance(): Promise<CreditBalance>
    getHistory(cursor?: string): Promise<CreditHistory>
  }

  // Stripe Checkout
  stripe: {
    createSubscriptionCheckout(opts: { tier: 'plus' | 'pro' }): Promise<StripeCheckoutResult>
    createCreditCheckout(opts: { packSize: number }): Promise<StripeCheckoutResult>
  }

  // Auth events — main → renderer push
  onAuthSessionExpired(cb: () => void): () => void

  // License events — main → renderer push
  onLicenseChanged(cb: (license: LicenseInfo | null) => void): () => void
  onCreditsChanged(cb: (balance: CreditBalance) => void): () => void
}
