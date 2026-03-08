import type { LapTimestamp } from '@racedash/core'

/**
 * Returns the lap that is currently being driven at `currentTime` seconds.
 * Before the race starts, returns the first lap.
 */
export function getLapAtTime(timestamps: LapTimestamp[], currentTime: number): LapTimestamp {
  let current = timestamps[0]
  for (const ts of timestamps) {
    if (ts.ytSeconds <= currentTime) current = ts
    else break
  }
  return current
}

/** Seconds elapsed since this lap started. */
export function getLapElapsed(ts: LapTimestamp, currentTime: number): number {
  return Math.max(0, currentTime - ts.ytSeconds)
}
