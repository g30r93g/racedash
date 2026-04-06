import type { CutRegion, KeptRange, Transition, Boundary, TransitionType } from '../../../../types/videoEditing'
import type { OverlayStyling } from '@racedash/core'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_OUT_DURATION_SECONDS,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_FADE_POST_ROLL_SECONDS,
  DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS,
  DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS,
  DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS,
  DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS,
} from '@racedash/core'

// ---------------------------------------------------------------------------
// computeKeptRanges
// ---------------------------------------------------------------------------

/**
 * Given a total frame count and an array of CutRegion, returns the ranges of
 * frames that are NOT cut. Overlapping cuts are merged before processing.
 */
export function computeKeptRanges(totalFrames: number, cuts: CutRegion[]): KeptRange[] {
  if (cuts.length === 0) {
    return [{ startFrame: 0, endFrame: totalFrames }]
  }

  // Sort and merge overlapping/adjacent cuts
  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)
  const merged: Array<{ startFrame: number; endFrame: number }> = []

  for (const cut of sorted) {
    if (merged.length === 0) {
      merged.push({ startFrame: cut.startFrame, endFrame: cut.endFrame })
    } else {
      const last = merged[merged.length - 1]
      if (cut.startFrame <= last.endFrame) {
        // Overlapping or adjacent — extend
        last.endFrame = Math.max(last.endFrame, cut.endFrame)
      } else {
        merged.push({ startFrame: cut.startFrame, endFrame: cut.endFrame })
      }
    }
  }

  // Build kept ranges from the gaps
  const kept: KeptRange[] = []
  let cursor = 0

  for (const cut of merged) {
    if (cursor < cut.startFrame) {
      kept.push({ startFrame: cursor, endFrame: cut.startFrame })
    }
    cursor = cut.endFrame
  }

  if (cursor < totalFrames) {
    kept.push({ startFrame: cursor, endFrame: totalFrames })
  }

  return kept
}

// ---------------------------------------------------------------------------
// toOutputFrame
// ---------------------------------------------------------------------------

/**
 * Maps a source frame to an output frame by subtracting the total length of
 * cut regions that begin entirely before the source frame.
 *
 * `transitions` and `fps` are accepted for API compatibility (future: account
 * for transition duration overlap).
 */
export function toOutputFrame(
  sourceFrame: number,
  cuts: CutRegion[],
  _transitions: Transition[],
  _fps: number
): number {
  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)
  let offset = 0

  for (const cut of sorted) {
    if (cut.startFrame >= sourceFrame) {
      break
    }
    const effectiveEnd = Math.min(cut.endFrame, sourceFrame)
    offset += effectiveEnd - cut.startFrame
  }

  return sourceFrame - offset
}

// ---------------------------------------------------------------------------
// toSourceFrame
// ---------------------------------------------------------------------------

/**
 * Inverse of toOutputFrame. Maps an output frame back to the original source
 * frame by adding back the cut lengths.
 */
export function toSourceFrame(
  outputFrame: number,
  cuts: CutRegion[],
  _transitions: Transition[],
  _fps: number
): number {
  // Sort cuts by start to iterate in order
  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)

  let sourceFrame = outputFrame
  let addedBack = 0

  for (const cut of sorted) {
    const cutLen = cut.endFrame - cut.startFrame
    // The cut starts at (cut.startFrame) in source coordinates.
    // In output coordinates that is (cut.startFrame - addedBack).
    // We compare against the ORIGINAL outputFrame, not the growing sourceFrame.
    const cutStartInOutput = cut.startFrame - addedBack

    if (cutStartInOutput <= outputFrame) {
      // This cut falls at or before the output position — push source forward
      sourceFrame += cutLen
      addedBack += cutLen
    } else {
      break
    }
  }

  return sourceFrame
}

// ---------------------------------------------------------------------------
// deriveSegmentBuffers
// ---------------------------------------------------------------------------

interface SegmentBuffers {
  preRollFrames: number
  postRollFrames: number
}

/**
 * Derives the pre/post-roll frame buffers from overlay styling.
 * Takes the maximum across FadeStyling and SegmentLabelStyling.
 * Falls back to defaults from @racedash/core when styling is undefined.
 */
export function deriveSegmentBuffers(
  styling: OverlayStyling | undefined,
  fps: number
): SegmentBuffers {
  const fade = styling?.fade
  const label = styling?.segmentLabel

  // Fade: preRoll = preRollSeconds + durationSeconds (fade-in)
  const fadePreRoll =
    (fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS) +
    (fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS)

  // Fade: postRoll = postRollSeconds + fadeOutDurationSeconds
  const fadePostRoll =
    (fade?.postRollSeconds ?? DEFAULT_FADE_POST_ROLL_SECONDS) +
    (fade?.fadeOutDurationSeconds ?? DEFAULT_FADE_OUT_DURATION_SECONDS)

  // SegmentLabel: preRoll = preRollSeconds + fadeInDurationSeconds
  const labelPreRoll =
    (label?.preRollSeconds ?? DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS) +
    (label?.fadeInDurationSeconds ?? DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS)

  // SegmentLabel: postRoll = postRollSeconds + fadeOutDurationSeconds
  const labelPostRoll =
    (label?.postRollSeconds ?? DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS) +
    (label?.fadeOutDurationSeconds ?? DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS)

  const preRollSeconds = Math.max(fadePreRoll, labelPreRoll)
  const postRollSeconds = Math.max(fadePostRoll, labelPostRoll)

  return {
    preRollFrames: preRollSeconds * fps,
    postRollFrames: postRollSeconds * fps,
  }
}

// ---------------------------------------------------------------------------
// inferCutBounds
// ---------------------------------------------------------------------------

interface SegmentSpan {
  startFrame: number
  endFrame: number
}

/**
 * Given the playhead position and segment spans (with per-segment buffer
 * zones), returns a CutRegion covering the dead space the playhead sits in,
 * or null if the playhead is inside a segment or its buffer zone.
 */
export function inferCutBounds(
  playheadFrame: number,
  segmentSpans: SegmentSpan[],
  buffers: { preRollFrames: number; postRollFrames: number },
  totalFrames: number
): CutRegion | null {
  if (segmentSpans.length === 0) {
    return null
  }

  const { preRollFrames, postRollFrames } = buffers
  const sorted = [...segmentSpans].sort((a, b) => a.startFrame - b.startFrame)

  // Check if the playhead is inside any segment or its buffer
  for (const span of sorted) {
    const bufferStart = span.startFrame - preRollFrames
    const bufferEnd = span.endFrame + postRollFrames
    if (playheadFrame >= bufferStart && playheadFrame < bufferEnd) {
      return null
    }
  }

  // Determine which gap the playhead is in
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  // Before first segment
  if (playheadFrame < first.startFrame - preRollFrames) {
    return {
      id: generateId(),
      startFrame: 0,
      endFrame: first.startFrame - preRollFrames,
    }
  }

  // After last segment
  if (playheadFrame >= last.endFrame + postRollFrames) {
    return {
      id: generateId(),
      startFrame: last.endFrame + postRollFrames,
      endFrame: totalFrames,
    }
  }

  // Between two adjacent segments
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]
    const gapStart = current.endFrame + postRollFrames
    const gapEnd = next.startFrame - preRollFrames

    if (playheadFrame >= gapStart && playheadFrame < gapEnd) {
      return {
        id: generateId(),
        startFrame: gapStart,
        endFrame: gapEnd,
      }
    }
  }

  return null
}

function generateId(): string {
  return `cut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// ---------------------------------------------------------------------------
// computeBoundaries
// ---------------------------------------------------------------------------

interface SegmentSpanWithId {
  id: string
  startFrame: number
  endFrame: number
}

/**
 * Computes all Boundary objects for a project:
 * - projectStart / projectEnd always included
 * - one 'cut' boundary per CutRegion
 * - one 'fileJoin' boundary at each video file join point
 */
export function computeBoundaries(
  totalFrames: number,
  cuts: CutRegion[],
  fileJoinFrames: number[],
  fps: number
): Boundary[] {
  const boundaries: Boundary[] = []

  // projectStart
  boundaries.push({
    id: 'start',
    kind: 'projectStart',
    frameInSource: 0,
    oneSided: true,
    label: 'Project Start',
    allowedTypes: ['fadeFromBlack', 'fadeThroughBlack'],
  })

  // projectEnd
  boundaries.push({
    id: 'end',
    kind: 'projectEnd',
    frameInSource: totalFrames,
    oneSided: true,
    label: 'Project End',
    allowedTypes: ['fadeToBlack', 'fadeThroughBlack'],
  })

  // Cut boundaries
  for (const cut of cuts) {
    boundaries.push({
      id: `cut:${cut.id}`,
      kind: 'cut',
      frameInSource: cut.startFrame,
      oneSided: false,
      label: `Cut at ${formatFrameAsTime(cut.startFrame, fps)}`,
      allowedTypes: ['fadeFromBlack', 'fadeToBlack', 'fadeThroughBlack', 'crossfade'],
    })
  }

  // File join boundaries: where one source video file ends and the next begins
  for (let i = 0; i < fileJoinFrames.length; i++) {
    const joinFrame = fileJoinFrames[i]
    boundaries.push({
      id: `fileJoin:${i}`,
      kind: 'segment',
      frameInSource: joinFrame,
      oneSided: false,
      label: `File join at ${formatFrameAsTime(joinFrame, fps)}`,
      allowedTypes: ['fadeFromBlack', 'fadeToBlack', 'fadeThroughBlack', 'crossfade'],
    })
  }

  return boundaries.sort((a, b) => a.frameInSource - b.frameInSource)
}

/**
 * Formats a frame number as a time string "M:SS.mm" using the given fps.
 */
export function formatFrameAsTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const centiseconds = Math.floor((totalSeconds % 1) * 100)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// reconcileTransitions
// ---------------------------------------------------------------------------

/**
 * Removes transitions whose boundaryId doesn't match any boundary in the
 * provided list.
 */
export function reconcileTransitions(
  transitions: Transition[],
  boundaries: Boundary[]
): { kept: Transition[]; removed: Transition[] } {
  const boundaryIds = new Set(boundaries.map((b) => b.id))
  const kept: Transition[] = []
  const removed: Transition[] = []

  for (const transition of transitions) {
    if (boundaryIds.has(transition.boundaryId)) {
      kept.push(transition)
    } else {
      removed.push(transition)
    }
  }

  return { kept, removed }
}
