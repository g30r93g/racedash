import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { BoxPosition, CornerPosition, LapOverlayProps, OverlayProps, SessionSegment } from '@racedash/core'
import { DEFAULT_LABEL_WINDOW_SECONDS } from '@racedash/core'
import {
  bundleRenderer,
  compositeVideo,
  extractClip,
  getOverlayOutputPath,
  getVideoDuration,
  getVideoFps,
  getVideoResolution,
  isMetalCompositorAvailable,
  joinVideos as compositorJoinVideos,
  metalComposite,
  renderOverlay,
  trimVideo,
  computeKeptRanges,
  type ResolvedTransition,
} from '@racedash/compositor'
import { parseOffset } from '@racedash/timestamps'
import {
  buildSessionSegments,
  loadTimingConfig,
  resolveSegmentPositionOverrides,
  resolveTimingSegments,
} from './timingSources'
import type {
  BatchRenderOpts,
  BatchJobProgressEvent,
  BatchJobResult,
  PrecomputedContext,
  RenderJobOpts,
} from './types'

const SUB_RENDER_PRE_ROLL_SECONDS = 5
const SUB_RENDER_POST_ROLL_SECONDS = 5

/** Overlay is always rendered at this base width. For higher-res video, it's scaled up during composite. */
const OVERLAY_BASE_WIDTH = 1920

function overlayDimensions(outputRes: { width: number; height: number }): {
  overlayWidth: number
  overlayHeight: number
  needsScale: boolean
} {
  if (outputRes.width <= OVERLAY_BASE_WIDTH) {
    return { overlayWidth: outputRes.width, overlayHeight: outputRes.height, needsScale: false }
  }
  const scale = OVERLAY_BASE_WIDTH / outputRes.width
  return {
    overlayWidth: OVERLAY_BASE_WIDTH,
    overlayHeight: Math.round(outputRes.height * scale),
    needsScale: true,
  }
}

const USE_METAL_COMPOSITOR = isMetalCompositorAvailable()

async function runComposite(
  sourcePath: string,
  overlayPath: string,
  outputPath: string,
  opts: {
    fps: number
    overlayX: number
    overlayY: number
    durationSeconds: number
    outputWidth?: number
    outputHeight?: number
    overlayScaleWidth?: number
    overlayScaleHeight?: number
  },
  onProgress: (p: number) => void,
  signal: AbortSignal,
): Promise<void> {
  if (USE_METAL_COMPOSITOR) {
    console.log('[perf]   using Metal compositor (GPU)')
    await metalComposite(
      {
        sourcePath,
        overlayPath,
        outputPath,
        overlayX: opts.overlayX,
        overlayY: opts.overlayY,
        overlayScaleWidth: opts.overlayScaleWidth,
        overlayScaleHeight: opts.overlayScaleHeight,
        fps: opts.fps,
      },
      signal,
      onProgress,
    )
  } else {
    console.log('[perf]   using FFmpeg compositor (CPU)')
    await compositeVideo(sourcePath, overlayPath, outputPath, opts, onProgress, signal)
  }
}

const BOX_STRIP_HEIGHTS: Partial<Record<string, number>> = { esports: 400, minimal: 400 }
const VALID_BOX_POSITIONS = ['bottom-left', 'bottom-center', 'bottom-right', 'top-left', 'top-center', 'top-right']
const VALID_TABLE_POSITIONS = ['bottom-left', 'bottom-right', 'top-left', 'top-right']

function snapToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps) / fps
}

function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000
}

function defaultBoxPositionForStyle(style: string): BoxPosition {
  return style === 'modern' ? 'bottom-center' : 'bottom-left'
}

export function rebaseSegment(
  segment: SessionSegment,
  actualClipStartSeconds: number,
  fps: number,
): SessionSegment {
  const rebaseTime = (yt: number) => snapToFrame(yt - actualClipStartSeconds, fps)

  return {
    ...segment,
    session: {
      ...segment.session,
      laps: segment.session.laps,
      timestamps: segment.session.timestamps.map((t) => ({
        ...t,
        ytSeconds: rebaseTime(t.ytSeconds),
      })),
    },
    sessionAllLaps: segment.sessionAllLaps,
    leaderboardDrivers: segment.leaderboardDrivers?.map((d) => ({
      ...d,
      timestamps: d.timestamps.map((t) => ({ ...t, ytSeconds: rebaseTime(t.ytSeconds) })),
    })),
    raceLapSnapshots: segment.raceLapSnapshots?.map((s) => ({
      ...s,
      videoTimestamp: rebaseTime(s.videoTimestamp),
    })),
    positionOverrides: segment.positionOverrides?.map((o) => ({
      ...o,
      timestamp: snapToFrame(o.timestamp - actualClipStartSeconds, fps),
    })),
  }
}

export function computeClipRange(
  startSeconds: number,
  endSeconds: number,
  fps: number,
  totalDurationSeconds: number,
): { startFrame: number; endFrame: number } {
  const startSec = Math.max(0, startSeconds - SUB_RENDER_PRE_ROLL_SECONDS)
  const endSec = Math.min(totalDurationSeconds, endSeconds + SUB_RENDER_POST_ROLL_SECONDS)
  return {
    startFrame: Math.round(startSec * fps), // inclusive
    endFrame: Math.round(endSec * fps), // exclusive
  }
}

export interface FileFrameRange {
  path: string
  startFrame: number // inclusive
  endFrame: number // exclusive
}

export function resolveSourceFiles(
  files: FileFrameRange[],
  requiredStartFrame: number,
  requiredEndFrame: number,
): FileFrameRange[] {
  return files.filter(
    (f) => f.startFrame < requiredEndFrame && f.endFrame > requiredStartFrame,
  )
}

// ---------------------------------------------------------------------------
// buildPrecomputedContext — extracted from renderSession precompute phase
// ---------------------------------------------------------------------------

export async function buildPrecomputedContext(
  opts: BatchRenderOpts,
  signal: AbortSignal,
  onPrecomputeProgress?: (phase: string, progress: number) => void,
): Promise<PrecomputedContext> {
  const report = onPrecomputeProgress ?? (() => {})

  // Only join all source files if there's an entireProject job.
  // Sub-renders (segment/lap) join only the files they need in renderSubClip.
  const needsFullJoin = opts.videoPaths.length > 1 &&
    opts.jobs.some((j) => j.type === 'entireProject')

  let videoPath = opts.videoPaths[0]
  let tempJoinedVideo: string | null = null

  if (needsFullJoin) {
    report('Joining source videos', 0)
    tempJoinedVideo = path.join(tmpdir(), `racedash-joined-${randomUUID()}.mp4`)
    await compositorJoinVideos(opts.videoPaths, tempJoinedVideo, signal)
    videoPath = tempJoinedVideo
    report('Joining source videos', 1)
  }

  // Load timing config
  const {
    segments: segmentConfigs,
    configBoxPosition,
    configTablePosition,
    overlayComponents,
    styling,
  } = await loadTimingConfig(opts.configPath, true)

  // Validate positions from config
  if (configBoxPosition != null && !VALID_BOX_POSITIONS.includes(configBoxPosition)) {
    throw new Error(`config.boxPosition must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
  }
  if (configTablePosition != null && !VALID_TABLE_POSITIONS.includes(configTablePosition)) {
    throw new Error(`config.qualifyingTablePosition must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
  }

  report('Probing video files', 0)

  // Probe first source file for resolution/fps (all files share these)
  const [videoResolution, fps] = await Promise.all([
    getVideoResolution(opts.videoPaths[0]),
    getVideoFps(opts.videoPaths[0]),
  ])

  const outputResolution = opts.outputResolution ?? videoResolution
  const frameDuration = 1 / fps

  // Build file frame range map — probe each file for duration
  const fileFrameRanges: FileFrameRange[] = []
  let cumulativeFrames = 0
  for (const filePath of opts.videoPaths) {
    const fileDuration = await getVideoDuration(filePath)
    const fileFrames = Math.round(fileDuration * fps)
    fileFrameRanges.push({
      path: filePath,
      startFrame: cumulativeFrames,
      endFrame: cumulativeFrames + fileFrames,
    })
    cumulativeFrames += fileFrames
  }

  // Total duration across all source files
  const durationSeconds = cumulativeFrames / fps

  report('Probing video files', 1)

  // Resolve timing segments
  const rawOffsets = segmentConfigs.map((segment) => parseOffset(segment.offset, fps))
  const snappedOffsets = rawOffsets.map((raw) => roundMillis(Math.round(raw / frameDuration) * frameDuration))

  const resolvedSegments = await resolveTimingSegments(segmentConfigs)
  const { segments, startingGridPosition } = buildSessionSegments(resolvedSegments, snappedOffsets)

  // Attach position overrides to each segment
  segments.forEach((segment, index) => {
    segment.positionOverrides = resolveSegmentPositionOverrides(
      segmentConfigs[index],
      resolvedSegments[index],
      rawOffsets[index],
      index,
      fps,
    )
  })

  // Resolve overlay positioning
  const boxPosition = (configBoxPosition ?? defaultBoxPositionForStyle(opts.style)) as BoxPosition
  const qualifyingTablePosition = configTablePosition as CornerPosition | undefined

  let overlayY = 0
  const stripHeight = BOX_STRIP_HEIGHTS[opts.style]
  if (stripHeight != null) {
    const scaledStrip = Math.round((stripHeight * outputResolution.width) / 1920)
    overlayY = boxPosition.startsWith('bottom') ? outputResolution.height - scaledStrip : 0
  }

  // Ensure output directories exist for all jobs
  for (const job of opts.jobs) {
    mkdirSync(path.dirname(job.outputPath), { recursive: true })
  }

  // Bundle the Remotion renderer once for all jobs
  report('Bundling renderer', 0)
  const serveUrl = await bundleRenderer(opts.rendererEntry)
  report('Bundling renderer', 1)

  return {
    videoPath,
    tempJoinedVideo,
    fps,
    durationSeconds,
    videoResolution,
    outputResolution,
    fileFrameRanges,
    segments,
    startingGridPosition,
    segmentConfigs,
    resolvedSegments,
    offsets: snappedOffsets,
    overlayY,
    boxPosition,
    qualifyingTablePosition,
    overlayComponents,
    styling,
    configBoxPosition,
    configTablePosition,
    serveUrl,
  }
}

// ---------------------------------------------------------------------------
// renderBatch — orchestrates multiple render jobs sharing one precomputed context
// ---------------------------------------------------------------------------

function elapsed(startMs: number): string {
  const ms = performance.now() - startMs
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

export async function renderBatch(
  opts: BatchRenderOpts,
  onJobProgress: (event: BatchJobProgressEvent) => void,
  onJobComplete: (result: BatchJobResult) => void,
  onJobError: (jobId: string, error: Error) => void,
  signal: AbortSignal,
): Promise<void> {
  const batchStart = performance.now()
  console.log(`[perf] renderBatch: starting ${opts.jobs.length} job(s)`)

  const precomputeStart = performance.now()
  const ctx = await buildPrecomputedContext(opts, signal, (phase, progress) => {
    onJobProgress({ jobId: '__precompute__', phase, progress })
  })
  console.log(`[perf] precompute: ${elapsed(precomputeStart)}`)

  try {
    for (const job of opts.jobs) {
      if (signal.aborted) break
      const jobStart = performance.now()
      console.log(`[perf] job ${job.id} (${job.type}): starting`)

      try {
        switch (job.type) {
          case 'entireProject':
            await renderEntireProject(opts, ctx, job, onJobProgress, signal)
            break
          case 'segment':
            await renderSegmentJob(opts, ctx, job, onJobProgress, signal)
            break
          case 'linkedSegment':
            await renderLinkedSegmentJob(opts, ctx, job, onJobProgress, signal)
            break
          case 'lap':
            await renderLapJob(opts, ctx, job, onJobProgress, signal)
            break
        }
        console.log(`[perf] job ${job.id} (${job.type}): completed in ${elapsed(jobStart)}`)
        onJobComplete({ jobId: job.id, outputPath: job.outputPath })
      } catch (err) {
        console.log(`[perf] job ${job.id} (${job.type}): failed after ${elapsed(jobStart)}`)
        if (signal.aborted) break
        onJobError(job.id, err instanceof Error ? err : new Error(String(err)))
      }
    }
  } finally {
    if (ctx.tempJoinedVideo) await unlink(ctx.tempJoinedVideo).catch(() => {})
  }

  console.log(`[perf] renderBatch: total ${elapsed(batchStart)}`)
}

// ---------------------------------------------------------------------------
// entireProject — mirrors the old renderSession pipeline
// ---------------------------------------------------------------------------

async function renderEntireProject(
  opts: BatchRenderOpts,
  ctx: PrecomputedContext,
  job: RenderJobOpts,
  onJobProgress: (event: BatchJobProgressEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const progress = (phase: string, p: number, extra?: { renderedFrames?: number; totalFrames?: number }) =>
    onJobProgress({ jobId: job.id, phase, progress: p, ...extra })

  const ovDim = overlayDimensions(ctx.outputResolution)

  const overlayProps: OverlayProps = {
    segments: ctx.segments,
    startingGridPosition: ctx.startingGridPosition,
    fps: ctx.fps,
    durationInFrames: Math.ceil(ctx.durationSeconds * ctx.fps),
    videoWidth: ovDim.overlayWidth,
    videoHeight: ovDim.overlayHeight,
    boxPosition: ctx.boxPosition,
    qualifyingTablePosition: ctx.qualifyingTablePosition,
    overlayComponents: ctx.overlayComponents,
    styling: ctx.styling,
    labelWindowSeconds: DEFAULT_LABEL_WINDOW_SECONDS,
  }

  const overlayPath = getOverlayOutputPath(job.outputPath)

  if (signal.aborted) return

  // Render overlay at base resolution (scaled up during composite if needed)
  await renderOverlay(
    ctx.serveUrl,
    opts.style,
    overlayProps,
    overlayPath,
    ({ progress: p, renderedFrames, totalFrames }) =>
      progress('Rendering overlay', p, { renderedFrames, totalFrames }),
    undefined,
    signal,
  )

  if (opts.renderMode === 'overlay-only') {
    return
  }

  if (signal.aborted) return

  // Composite overlay onto footage
  const hasCuts = opts.cutRegions && opts.cutRegions.length > 0
  const compositeOutputPath = hasCuts
    ? path.join(tmpdir(), `racedash-composite-${randomUUID()}.mp4`)
    : job.outputPath

  try {
    await runComposite(
      ctx.videoPath,
      overlayPath,
      compositeOutputPath,
      {
        fps: ctx.fps,
        overlayX: 0,
        overlayY: ctx.overlayY,
        durationSeconds: ctx.durationSeconds,
        ...(opts.outputResolution && (opts.outputResolution.width !== ctx.videoResolution.width || opts.outputResolution.height !== ctx.videoResolution.height)
          ? { outputWidth: opts.outputResolution.width, outputHeight: opts.outputResolution.height }
          : {}),
        ...(ovDim.needsScale ? { overlayScaleWidth: ctx.outputResolution.width, overlayScaleHeight: ctx.outputResolution.height } : {}),
      },
      (p) => progress('Compositing', hasCuts ? p * 0.85 : p),
      signal,
    )
  } finally {
    // await unlink(overlayPath).catch(() => {}) // temporarily keep for color debugging
  }

  // Apply cut regions and transitions
  if (hasCuts) {
    if (signal.aborted) {
      await unlink(compositeOutputPath).catch(() => {})
      return
    }

    const totalFrames = Math.ceil(ctx.durationSeconds * ctx.fps)
    const keptRanges = computeKeptRanges(totalFrames, opts.cutRegions!)
    const rawTransitions = opts.transitions ?? []

    const resolved: ResolvedTransition[] = []
    for (const t of rawTransitions) {
      if (t.boundaryId === 'start') {
        resolved.push({ seam: 'start', type: t.type as ResolvedTransition['type'], durationMs: t.durationMs })
      } else if (t.boundaryId === 'end') {
        resolved.push({ seam: 'end', type: t.type as ResolvedTransition['type'], durationMs: t.durationMs })
      } else {
        const cutId = t.boundaryId.startsWith('cut:') ? t.boundaryId.slice(4) : null
        const cut = cutId ? opts.cutRegions!.find((c) => c.id === cutId) : null

        for (let si = 0; si < keptRanges.length - 1; si++) {
          const gapStart = keptRanges[si].endFrame
          const gapEnd = keptRanges[si + 1].startFrame
          if (cut && cut.startFrame >= gapStart && cut.endFrame <= gapEnd) {
            resolved.push({ seam: si, type: t.type as ResolvedTransition['type'], durationMs: t.durationMs })
            break
          }
          if (t.boundaryId.startsWith('fileJoin:')) {
            const boundaryInGap = gapStart <= gapEnd
            if (boundaryInGap) {
              resolved.push({ seam: si, type: t.type as ResolvedTransition['type'], durationMs: t.durationMs })
              break
            }
          }
        }
      }
    }

    try {
      await trimVideo(
        compositeOutputPath,
        job.outputPath,
        opts.cutRegions!,
        resolved,
        ctx.fps,
        ctx.durationSeconds,
        (p) => progress('Trimming', 0.85 + p * 0.15),
        signal,
      )
    } finally {
      await unlink(compositeOutputPath).catch(() => {})
    }
  }
}

// ---------------------------------------------------------------------------
// segment — extract clip, overlay, composite for a single segment
// ---------------------------------------------------------------------------

async function renderSegmentJob(
  opts: BatchRenderOpts,
  ctx: PrecomputedContext,
  job: RenderJobOpts,
  onJobProgress: (event: BatchJobProgressEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const segIndex = job.segmentIndices[0]
  const segment = ctx.segments[segIndex]
  const timestamps = segment.session.timestamps

  if (timestamps.length === 0) {
    throw new Error(`Segment ${segIndex} has no timestamps`)
  }

  const segStartSeconds = timestamps[0].ytSeconds
  const lastTimestamp = timestamps[timestamps.length - 1]
  const segEndSeconds = lastTimestamp.ytSeconds + lastTimestamp.lap.lapTime

  await renderSubClip(opts, ctx, job, [segIndex], segStartSeconds, segEndSeconds, onJobProgress, signal)
}

// ---------------------------------------------------------------------------
// linkedSegment — extract clip, overlay with multiple segments, composite
// ---------------------------------------------------------------------------

async function renderLinkedSegmentJob(
  opts: BatchRenderOpts,
  ctx: PrecomputedContext,
  job: RenderJobOpts,
  onJobProgress: (event: BatchJobProgressEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  // Find the time range that spans all linked segments
  let minStart = Infinity
  let maxEnd = -Infinity
  for (const segIndex of job.segmentIndices) {
    const timestamps = ctx.segments[segIndex].session.timestamps
    if (timestamps.length === 0) continue
    const lastTs = timestamps[timestamps.length - 1]
    minStart = Math.min(minStart, timestamps[0].ytSeconds)
    maxEnd = Math.max(maxEnd, lastTs.ytSeconds + lastTs.lap.lapTime)
  }

  if (!isFinite(minStart) || !isFinite(maxEnd)) {
    throw new Error(`Linked segments ${job.segmentIndices.join(',')} have no timestamps`)
  }

  await renderSubClip(opts, ctx, job, job.segmentIndices, minStart, maxEnd, onJobProgress, signal)
}

// ---------------------------------------------------------------------------
// lap — segment clip filtered to a specific lap
// ---------------------------------------------------------------------------

async function renderLapJob(
  opts: BatchRenderOpts,
  ctx: PrecomputedContext,
  job: RenderJobOpts,
  onJobProgress: (event: BatchJobProgressEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (job.lapNumber == null) {
    throw new Error(`Lap job ${job.id} requires lapNumber`)
  }

  const segIndex = job.segmentIndices[0]
  const segment = ctx.segments[segIndex]
  const timestamps = segment.session.timestamps

  // Find the timestamp entries for this lap
  const lapTimestamps = timestamps.filter((t) => t.lap.number === job.lapNumber)
  if (lapTimestamps.length === 0) {
    throw new Error(`No timestamps found for lap ${job.lapNumber} in segment ${segIndex}`)
  }

  const lapStartSeconds = lapTimestamps[0].ytSeconds
  const lapEndSeconds = lapTimestamps[0].ytSeconds + lapTimestamps[0].lap.lapTime

  // Use the lap time range for clip extraction (not full segment)
  // The 5s pre/post-roll is added by computeClipRange inside renderSubClip
  await renderSubClip(
    opts, ctx, job, [segIndex], lapStartSeconds, lapEndSeconds, onJobProgress, signal,
    { targetLapNumber: job.lapNumber, lapStartSeconds, lapEndSeconds },
  )
}

// ---------------------------------------------------------------------------
// Shared sub-clip render pipeline (used by segment, linkedSegment, lap)
// ---------------------------------------------------------------------------

interface LapInfo {
  targetLapNumber: number
  lapStartSeconds: number
  lapEndSeconds: number
}

async function renderSubClip(
  opts: BatchRenderOpts,
  ctx: PrecomputedContext,
  job: RenderJobOpts,
  segmentIndices: number[],
  startSeconds: number,
  endSeconds: number,
  onJobProgress: (event: BatchJobProgressEvent) => void,
  signal: AbortSignal,
  lapInfo?: LapInfo,
): Promise<void> {
  const progress = (phase: string, p: number, extra?: { renderedFrames?: number; totalFrames?: number }) =>
    onJobProgress({ jobId: job.id, phase, progress: p, ...extra })

  // Compute clip range with pre/post roll
  const clipRange = computeClipRange(startSeconds, endSeconds, ctx.fps, ctx.durationSeconds)

  // Resolve which source files are needed
  const neededFiles = resolveSourceFiles(ctx.fileFrameRanges, clipRange.startFrame, clipRange.endFrame)

  if (neededFiles.length === 0) {
    throw new Error(`No source files cover frame range ${clipRange.startFrame}-${clipRange.endFrame}`)
  }

  // If multiple source files needed, join them first
  let clipSourcePath = neededFiles[0].path
  let tempJoinedClip: string | null = null
  // Frame offset to convert global frames to source-local frames
  let sourceFrameOffset = neededFiles[0].startFrame

  if (neededFiles.length > 1) {
    tempJoinedClip = path.join(tmpdir(), `racedash-clip-join-${randomUUID()}.mp4`)
    if (signal.aborted) return
    progress('Joining source files', 0)
    await compositorJoinVideos(neededFiles.map((f) => f.path), tempJoinedClip, signal)
    clipSourcePath = tempJoinedClip
    // When files are joined, the joined file's timeline starts at 0
    // covering from neededFiles[0].startFrame to neededFiles[last].endFrame
    sourceFrameOffset = neededFiles[0].startFrame
    progress('Joining source files', 1)
  }

  // Convert global frame range to source-local frame range
  const localStartFrame = clipRange.startFrame - sourceFrameOffset
  const localEndFrame = clipRange.endFrame - sourceFrameOffset

  try {
    // Compute clip duration from frame range (avoids spawning ffprobe)
    const clipFrames = localEndFrame - localStartFrame
    const clipDuration = clipFrames / ctx.fps

    if (signal.aborted) return

    const tempClipPath = path.join(tmpdir(), `racedash-clip-${randomUUID()}.mp4`)

    try {
      let phaseStart = performance.now()
      progress('Extracting clip', 0)
      const { actualStartSeconds } = await extractClip(
        clipSourcePath,
        tempClipPath,
        localStartFrame,
        localEndFrame,
        ctx.fps,
        signal,
        (p) => progress('Extracting clip', p),
      )
      console.log(`[perf]   extractClip: ${elapsed(phaseStart)} (${clipFrames} frames, ${clipDuration.toFixed(1)}s)`)

      if (signal.aborted) return

      // Rebase segments: actualStartSeconds is local to the source file,
      // but ytSeconds in segments is global. Add sourceFrameOffset to get global time.
      const globalClipStartSeconds = actualStartSeconds + sourceFrameOffset / ctx.fps
      let rebasedSegments: SessionSegment[] = segmentIndices.map((segIndex) =>
        rebaseSegment(ctx.segments[segIndex], globalClipStartSeconds, ctx.fps),
      )

      // For lap jobs, filter segment data to only the target lap
      if (lapInfo) {
        rebasedSegments = rebasedSegments.map((seg) => ({
          ...seg,
          session: {
            ...seg.session,
            laps: seg.session.laps.filter((l) => l.number === lapInfo.targetLapNumber),
            timestamps: seg.session.timestamps.filter((t) => t.lap.number === lapInfo.targetLapNumber),
          },
        }))
      }

      // Build overlay props at base resolution (scaled up during composite if needed)
      const ovDim = overlayDimensions(ctx.outputResolution)
      let overlayProps: OverlayProps | LapOverlayProps = {
        segments: rebasedSegments,
        startingGridPosition: ctx.startingGridPosition,
        fps: ctx.fps,
        durationInFrames: clipFrames,
        videoWidth: ovDim.overlayWidth,
        videoHeight: ovDim.overlayHeight,
        boxPosition: ctx.boxPosition,
        qualifyingTablePosition: ctx.qualifyingTablePosition,
        overlayComponents: ctx.overlayComponents,
        styling: ctx.styling,
        labelWindowSeconds: DEFAULT_LABEL_WINDOW_SECONDS,
      }

      // For lap jobs, add lap-specific fields
      if (lapInfo) {
        const targetLapStartFrame = Math.round((lapInfo.lapStartSeconds - globalClipStartSeconds) * ctx.fps)
        const targetLapEndFrame = Math.round((lapInfo.lapEndSeconds - globalClipStartSeconds) * ctx.fps)
        overlayProps = {
          ...overlayProps,
          targetLapNumber: lapInfo.targetLapNumber,
          targetLapStartFrame: Math.max(0, targetLapStartFrame),
          targetLapEndFrame: Math.min(clipFrames, targetLapEndFrame),
        } as LapOverlayProps
      }

      const overlayPath = getOverlayOutputPath(job.outputPath)

      if (signal.aborted) return

      // Render overlay (using pre-bundled serveUrl)
      phaseStart = performance.now()
      await renderOverlay(
        ctx.serveUrl,
        opts.style,
        overlayProps,
        overlayPath,
        ({ progress: p, renderedFrames, totalFrames }) =>
          progress('Rendering overlay', p, { renderedFrames, totalFrames }),
        undefined,
        signal,
      )
      console.log(`[perf]   renderOverlay: ${elapsed(phaseStart)}`)

      if (opts.renderMode === 'overlay-only') {
        return
      }

      if (signal.aborted) return

      // Composite overlay onto clip
      phaseStart = performance.now()
      try {
        await runComposite(
          tempClipPath,
          overlayPath,
          job.outputPath,
          {
            fps: ctx.fps,
            overlayX: 0,
            overlayY: ctx.overlayY,
            durationSeconds: clipDuration,
            ...(opts.outputResolution && (opts.outputResolution.width !== ctx.videoResolution.width || opts.outputResolution.height !== ctx.videoResolution.height)
              ? { outputWidth: opts.outputResolution.width, outputHeight: opts.outputResolution.height }
              : {}),
            ...(ovDim.needsScale ? { overlayScaleWidth: ctx.outputResolution.width, overlayScaleHeight: ctx.outputResolution.height } : {}),
          },
          (p) => progress('Compositing', p),
          signal,
        )
      } finally {
        // await unlink(overlayPath).catch(() => {}) // temporarily keep for color debugging
      }
      console.log(`[perf]   compositeVideo: ${elapsed(phaseStart)}`)
    } finally {
      await unlink(tempClipPath).catch(() => {})
    }
  } finally {
    if (tempJoinedClip) await unlink(tempJoinedClip).catch(() => {})
  }
}
