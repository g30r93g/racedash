import type { LapTimestamp } from '@racedash/core'

/**
 * Returns the lap that is currently being driven at `currentTime` seconds.
 * Before the race starts, returns the first lap.
 */
export function getLapAtTime(timestamps: LapTimestamp[], currentTime: number): LapTimestamp {
  let lo = 0
  let hi = timestamps.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (timestamps[mid].ytSeconds <= currentTime) lo = mid
    else hi = mid - 1
  }
  return timestamps[lo]
}

/** Seconds elapsed since this lap started. */
export function getLapElapsed(ts: LapTimestamp, currentTime: number): number {
  return Math.max(0, currentTime - ts.ytSeconds)
}

/** All laps completed before the current in-progress lap (indices 0..currentIdx-1). */
export function getCompletedLaps(timestamps: LapTimestamp[], currentIdx: number): LapTimestamp[] {
  return timestamps.slice(0, currentIdx)
}

/**
 * The fastest lap time (seconds) from a set of completed laps,
 * or null if the array is empty.
 */
export function getSessionBest(completedLaps: LapTimestamp[]): number | null {
  if (completedLaps.length === 0) return null
  return Math.min(...completedLaps.map(ts => ts.lap.lapTime))
}
