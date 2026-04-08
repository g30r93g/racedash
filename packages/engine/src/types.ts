import type { BoxPosition, CornerPosition, OverlayComponentsConfig, OverlayStyling, SessionSegment } from '@racedash/core'
import type { DriversCommandSegment, ResolvedTimingSegment, SegmentConfig } from './timingSources'

export interface DriversOptions {
  configPath: string
  driverQuery?: string
}

export interface DriversResult {
  segments: DriversCommandSegment[]
  driverListsIdentical: boolean
}

export interface TimestampsOptions {
  configPath: string
  fps?: number
}

export interface TimestampsResult {
  chapters: string
  segments: ResolvedTimingSegment[]
  offsets: number[]
}

export interface RenderOptions {
  configPath: string
  /** Pre-resolved file paths — caller handles interactive selection. Single file or multiple (joined automatically). */
  videoPaths: string[]
  outputPath: string
  /** Absolute path to apps/renderer/src/index.ts — supplied by caller since engine cannot assume its location relative to the renderer. */
  rendererEntry: string
  style: string
  /** Resolved output dimensions. Pass undefined to use source video resolution. */
  outputResolution?: { width: number; height: number }
  overlayX?: number
  overlayY?: number
  boxPosition?: BoxPosition
  qualifyingTablePosition?: CornerPosition
  labelWindowSeconds?: number
  noCache?: boolean
  onlyRenderOverlay?: boolean
  /** Cut regions to remove from the exported video. */
  cutRegions?: Array<{ id: string; startFrame: number; endFrame: number }>
  /** Transitions at seam boundaries. */
  transitions?: Array<{ id: string; boundaryId: string; type: string; durationMs: number }>
}

export interface RenderProgressEvent {
  phase: string
  /** 0–1 */
  progress: number
  renderedFrames?: number
  totalFrames?: number
}

export interface RenderResult {
  outputPath: string
  overlayReused: boolean
}

export type RenderJobType = 'entireProject' | 'segment' | 'linkedSegment' | 'lap'

export interface RenderJobOpts {
  id: string
  type: RenderJobType
  segmentIndices: number[]
  lapNumber?: number
  outputPath: string
}

export interface BatchRenderOpts {
  configPath: string
  videoPaths: string[]
  rendererEntry: string
  style: string
  outputResolution?: { width: number; height: number }
  renderMode?: 'overlay+footage' | 'overlay-only'
  jobs: RenderJobOpts[]
  cutRegions?: Array<{ id: string; startFrame: number; endFrame: number }>
  transitions?: Array<{ id: string; boundaryId: string; type: string; durationMs: number }>
}

export interface BatchJobProgressEvent {
  jobId: string
  phase: string
  progress: number
  renderedFrames?: number
  totalFrames?: number
}

export interface BatchJobResult {
  jobId: string
  outputPath: string
}

export interface PrecomputedContext {
  /** Path to the (possibly joined) source video. */
  videoPath: string
  /** Temp file to clean up if videos were joined, or null. */
  tempJoinedVideo: string | null
  fps: number
  durationSeconds: number
  videoResolution: { width: number; height: number }
  outputResolution: { width: number; height: number }
  /** Frame ranges for each source file (inclusive start, exclusive end). */
  fileFrameRanges: Array<{ path: string; startFrame: number; endFrame: number }>
  /** Fully built session segments with position overrides attached. */
  segments: SessionSegment[]
  startingGridPosition?: number
  /** Segment configs from the timing config file. */
  segmentConfigs: SegmentConfig[]
  /** Resolved timing segments (pre-build). */
  resolvedSegments: ResolvedTimingSegment[]
  /** Snapped offsets per segment. */
  offsets: number[]
  overlayY: number
  boxPosition: BoxPosition
  qualifyingTablePosition?: CornerPosition
  overlayComponents?: OverlayComponentsConfig
  styling?: OverlayStyling
  configBoxPosition?: string
  configTablePosition?: string
  /** Pre-bundled Remotion serve URL — bundle once, reuse across all jobs. */
  serveUrl: string
}
