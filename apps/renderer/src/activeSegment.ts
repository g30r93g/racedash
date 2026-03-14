import { useMemo } from 'react'
import { DEFAULT_LABEL_WINDOW_SECONDS, type SessionSegment } from '@racedash/core'

export interface ActiveSegmentResult {
  segment: SessionSegment
  isEnd: boolean
  label: string | null
}

/**
 * Resolves the active segment and transition state for a given video time.
 *
 * Active segment: the last segment whose offset (timestamps[0].ytSeconds) <= currentTime.
 * If currentTime is before the first segment's offset, returns the first segment
 * (the overlay will be hidden via its own raceStart guard).
 *
 * isEnd: true when currentTime >= the active segment's last lap end time.
 *
 * label: the label string of the first segment whose label window covers currentTime, or null.
 * Label window for segment i:
 *   labelStart = max(segOffset - window, prevSegEnd ?? 0)   — clamped so it never overlaps prior session
 *   labelEnd   = segOffset + window
 */
export function resolveActiveSegment(
  segments: SessionSegment[],
  currentTime: number,
  labelWindowSeconds: number,
): ActiveSegmentResult {
  // Find active segment index
  let activeIdx = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].session.timestamps[0].ytSeconds <= currentTime) activeIdx = i
  }
  const segment = segments[activeIdx]

  // Compute isEnd
  const lastTs = segment.session.timestamps[segment.session.timestamps.length - 1]
  const segEnd = lastTs.ytSeconds + lastTs.lap.lapTime
  const isEnd = currentTime >= segEnd

  // Compute label
  let label: string | null = null
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
    const labelStart = Math.max(segOffset - labelWindowSeconds, prevEnd)
    const labelEnd = segOffset + labelWindowSeconds
    if (currentTime >= labelStart && currentTime <= labelEnd) {
      label = s.label
      break
    }
  }

  return { segment, isEnd, label }
}

/** Memoised hook wrapper around resolveActiveSegment. */
export function useActiveSegment(
  segments: SessionSegment[],
  currentTime: number,
  labelWindowSeconds = DEFAULT_LABEL_WINDOW_SECONDS,
): ActiveSegmentResult {
  return useMemo(
    () => resolveActiveSegment(segments, currentTime, labelWindowSeconds),
    [segments, currentTime, labelWindowSeconds],
  )
}
