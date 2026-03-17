import type { BoxPosition, CornerPosition } from '@racedash/core'
import type { DriversCommandSegment, ResolvedTimingSegment } from './timingSources'

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
