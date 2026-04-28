import { useMemo } from 'react'
import {
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS,
  DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS,
  type FadeStyling,
  type SegmentLabelStyling,
  type SessionSegment,
} from '@racedash/core'

export interface ActiveSegmentResult {
  segment: SessionSegment
  isEnd: boolean
  /** Time (in video seconds) when the active segment's last lap ends. */
  segEnd: number
  label: string | null
  /** Start of the label display window (video seconds), or null if no label visible. */
  labelStart: number | null
  /** End of the label display window (video seconds), or null if no label visible. */
  labelEnd: number | null
}

/**
 * Resolves the active segment and transition state for a given video time.
 *
 * Active segment: the last segment whose pre-roll start
 * (timestamps[0].ytSeconds - fadePreRoll) <= currentTime.
 * This ensures useFadeOpacity sees the full fade-in window for every segment,
 * not just the first.
 *
 * isEnd: true when currentTime >= the active segment's last lap end time.
 *
 * label: the label string of the first segment whose label window covers currentTime, or null.
 * Label window for segment i:
 *   labelStart = max(segOffset - preRoll, prevSegEnd ?? 0)   — clamped so it never overlaps prior session
 *   labelEnd   = segOffset + postRoll
 *
 * When labelStyling is provided, preRoll/postRoll are read from it.
 * Falls back to labelWindowSeconds for both when labelStyling is undefined (backward compat).
 */
export function resolveActiveSegment(
  segments: SessionSegment[],
  currentTime: number,
  labelWindowSeconds: number,
  labelStyling?: SegmentLabelStyling,
  fadeStyling?: FadeStyling,
): ActiveSegmentResult {
  const fadePreRoll = fadeStyling?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS

  // Find active segment index — switch to the next segment at its pre-roll
  // start so useFadeOpacity can run the full fade-in for every segment.
  let activeIdx = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].session.timestamps[0].ytSeconds - fadePreRoll <= currentTime) activeIdx = i
  }
  const segment = segments[activeIdx]

  // Compute isEnd
  const lastTs = segment.session.timestamps[segment.session.timestamps.length - 1]
  const segEnd = lastTs.ytSeconds + lastTs.lap.lapTime
  const isEnd = currentTime >= segEnd

  // Compute label
  const labelPreRoll = labelStyling?.preRollSeconds ?? DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS
  const labelPostRoll = labelStyling?.postRollSeconds ?? DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS
  let label: string | null = null
  let activeLabelStart: number | null = null
  let activeLabelEnd: number | null = null
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (!s.label) continue
    const segOffset = s.session.timestamps[0].ytSeconds
    let prevEnd = 0
    if (i > 0) {
      const prev = segments[i - 1]
      const prevLast = prev.session.timestamps[prev.session.timestamps.length - 1]
      prevEnd = prevLast.ytSeconds + prevLast.lap.lapTime
    }
    const lStart = Math.max(segOffset - labelPreRoll, prevEnd)
    const lEnd = segOffset + labelPostRoll
    if (currentTime >= lStart && currentTime <= lEnd) {
      label = s.label
      activeLabelStart = lStart
      activeLabelEnd = lEnd
      break
    }
  }

  return { segment, isEnd, segEnd, label, labelStart: activeLabelStart, labelEnd: activeLabelEnd }
}

/** Memoised hook wrapper around resolveActiveSegment. */
export function useActiveSegment(
  segments: SessionSegment[],
  currentTime: number,
  labelWindowSeconds = DEFAULT_LABEL_WINDOW_SECONDS,
  labelStyling?: SegmentLabelStyling,
  fadeStyling?: FadeStyling,
): ActiveSegmentResult {
  return useMemo(
    () => resolveActiveSegment(segments, currentTime, labelWindowSeconds, labelStyling, fadeStyling),
    [segments, currentTime, labelWindowSeconds, labelStyling, fadeStyling],
  )
}
