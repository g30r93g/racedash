import path from 'node:path'
import { access, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  collectDoctorDiagnostics,
  compositeVideo,
  getOverlayOutputPath,
  getVideoDuration,
  getVideoFps,
  getVideoResolution,
  joinVideos as compositorJoinVideos,
  renderOverlay,
} from '@racedash/compositor'
import type { BoxPosition, CornerPosition } from '@racedash/core'
import { DEFAULT_LABEL_WINDOW_SECONDS } from '@racedash/core'
import { formatChapters, parseOffset } from '@racedash/timestamps'
import {
  buildSessionSegments,
  driverListsAreIdentical,
  flattenTimestamps,
  loadTimingConfig,
  resolveDriversCommandSegments,
  resolvePositionOverrides,
  resolveSegmentPositionOverrides,
  resolveTimingSegments,
} from './timingSources'
import type {
  DriversOptions,
  DriversResult,
  RenderOptions,
  RenderProgressEvent,
  RenderResult,
  TimestampsOptions,
  TimestampsResult,
} from './types'

export function getRenderExperimentalWarning(platform: NodeJS.Platform = process.platform): string | undefined {
  if (platform !== 'win32') return undefined
  return 'Windows render support is experimental and may require fallback paths depending on your FFmpeg and GPU setup.'
}

export async function runDoctor(): Promise<Array<{ label: string; value: string }>> {
  return collectDoctorDiagnostics()
}

export async function joinVideos(files: string[], outputPath: string): Promise<void> {
  return compositorJoinVideos(files, outputPath)
}

export async function listDrivers(opts: DriversOptions): Promise<DriversResult> {
  const { segments: segmentConfigs } = await loadTimingConfig(opts.configPath, false)
  const withOverride = opts.driverQuery
    ? segmentConfigs.map((seg) => ({ ...seg, driver: opts.driverQuery }))
    : segmentConfigs
  const segments = await resolveDriversCommandSegments(withOverride)
  return {
    segments,
    driverListsIdentical: driverListsAreIdentical(segments),
  }
}

export async function generateTimestamps(opts: TimestampsOptions): Promise<TimestampsResult> {
  const { segments: segmentConfigs } = await loadTimingConfig(opts.configPath, true)
  const resolvedSegments = await resolveTimingSegments(segmentConfigs)
  const offsets = segmentConfigs.map((segment) => parseOffset(segment.offset, opts.fps))
  const { segments } = buildSessionSegments(resolvedSegments, offsets)
  return {
    chapters: formatChapters(flattenTimestamps(segments)),
    segments: resolvedSegments,
    offsets,
  }
}

const BOX_STRIP_HEIGHTS: Partial<Record<string, number>> = { esports: 400, minimal: 400 }
const VALID_BOX_POSITIONS = ['bottom-left', 'bottom-center', 'bottom-right', 'top-left', 'top-center', 'top-right']
const VALID_TABLE_POSITIONS = ['bottom-left', 'bottom-right', 'top-left', 'top-right']

function defaultBoxPositionForStyle(style: string): BoxPosition {
  return style === 'modern' ? 'bottom-center' : 'bottom-left'
}

function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000
}

export async function renderSession(
  opts: RenderOptions,
  onProgress: (event: RenderProgressEvent) => void,
  onDiagnostic?: (diagnostic: { label: string; value: string }) => void,
): Promise<RenderResult> {
  let videoPath = opts.videoPaths[0]
  let tempJoinedVideo: string | null = null

  try {
    if (opts.videoPaths.length > 1) {
      tempJoinedVideo = path.join(tmpdir(), `racedash-joined-${randomUUID()}.mp4`)
      onProgress({ phase: 'Joining videos', progress: 0 })
      await compositorJoinVideos(opts.videoPaths, tempJoinedVideo)
      videoPath = tempJoinedVideo
      onProgress({ phase: 'Joining videos', progress: 1 })
    }

    const {
      segments: segmentConfigs,
      configBoxPosition,
      configTablePosition,
      overlayComponents,
      styling,
    } = await loadTimingConfig(opts.configPath, true)

    // Validate positions from config file (CLI validates CLI-flag positions; engine validates config-sourced positions)
    if (configBoxPosition != null && !VALID_BOX_POSITIONS.includes(configBoxPosition)) {
      throw new Error(`config.boxPosition must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
    }
    if (configTablePosition != null && !VALID_TABLE_POSITIONS.includes(configTablePosition)) {
      throw new Error(`config.qualifyingTablePosition must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
    }

    const [durationSeconds, videoResolution, fps] = await Promise.all([
      getVideoDuration(videoPath),
      getVideoResolution(videoPath),
      getVideoFps(videoPath),
    ])

    const outputResolution = opts.outputResolution ?? videoResolution
    const frameDuration = 1 / fps

    const rawOffsets = segmentConfigs.map((segment) => parseOffset(segment.offset, fps))
    const snappedOffsets = rawOffsets.map((raw) => roundMillis(Math.round(raw / frameDuration) * frameDuration))

    const resolvedSegments = await resolveTimingSegments(segmentConfigs)
    const { segments, startingGridPosition } = buildSessionSegments(resolvedSegments, snappedOffsets)
    segments.forEach((segment, index) => {
      segment.positionOverrides = resolveSegmentPositionOverrides(
        segmentConfigs[index],
        resolvedSegments[index],
        rawOffsets[index],
        index,
        fps,
      )
    })

    const boxPosition = (opts.boxPosition ?? configBoxPosition ?? defaultBoxPositionForStyle(opts.style)) as BoxPosition
    const resolvedTablePosition = (opts.qualifyingTablePosition ?? configTablePosition) as CornerPosition | undefined

    // Compute overlayY from style strip heights if not explicitly provided
    let overlayY = opts.overlayY ?? 0
    const stripHeight = BOX_STRIP_HEIGHTS[opts.style]
    if (stripHeight != null && opts.overlayY == null) {
      const scaledStrip = Math.round((stripHeight * outputResolution.width) / 1920)
      overlayY = boxPosition.startsWith('bottom') ? outputResolution.height - scaledStrip : 0
    }

    const overlayProps = {
      segments,
      startingGridPosition,
      fps,
      durationInFrames: Math.ceil(durationSeconds * fps),
      videoWidth: outputResolution.width,
      videoHeight: outputResolution.height,
      boxPosition,
      qualifyingTablePosition: resolvedTablePosition,
      overlayComponents,
      styling,
      labelWindowSeconds: opts.labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS,
    }

    const overlayPath = getOverlayOutputPath(opts.outputPath)

    let overlayReused = false
    if (!opts.noCache) {
      try {
        await access(overlayPath)
        const overlayDuration = await getVideoDuration(overlayPath)
        overlayReused = overlayDuration > 0
      } catch {
        overlayReused = false
      }
    }

    if (!overlayReused) {
      await renderOverlay(
        opts.rendererEntry,
        opts.style,
        overlayProps,
        overlayPath,
        ({ progress, renderedFrames, totalFrames }) =>
          onProgress({ phase: 'Rendering overlay', progress, renderedFrames, totalFrames }),
      )
    }

    if (opts.onlyRenderOverlay) {
      return { outputPath: overlayPath, overlayReused }
    }

    await compositeVideo(
      videoPath,
      overlayPath,
      opts.outputPath,
      {
        fps,
        overlayX: opts.overlayX ?? 0,
        overlayY,
        durationSeconds,
        // Only pass output dimensions when an explicit resolution preset was requested.
        // Passing undefined lets FFmpeg skip the scale filter and use source dimensions.
        outputWidth: opts.outputResolution?.width,
        outputHeight: opts.outputResolution?.height,
        onDiagnostic,
      },
      (progress) => onProgress({ phase: 'Compositing', progress }),
    )

    return { outputPath: opts.outputPath, overlayReused }
  } finally {
    if (tempJoinedVideo) await unlink(tempJoinedVideo).catch(() => {})
  }
}
