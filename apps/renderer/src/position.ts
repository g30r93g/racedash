import type { Lap, SessionMode } from '@racedash/core'

/**
 * Compute race position at the end of `lapNumber`.
 *
 * Race: rank by cumulative time at lap N (lower = better).
 * Practice/Qualifying: rank by best lap time through lap N (lower = better).
 *
 * Drivers without N laps completed are excluded from comparison.
 */
export function getPosition(
  mode: SessionMode,
  lapNumber: number,
  currentLaps: Lap[],
  sessionAllLaps: Lap[][],
): number {
  const score = computeScore(mode, lapNumber, currentLaps)
  if (score === null) return 1

  let position = 1
  for (const driverLaps of sessionAllLaps) {
    if (driverLaps === currentLaps) continue
    const driverScore = computeScore(mode, lapNumber, driverLaps)
    if (driverScore !== null && driverScore < score) position++
  }
  return position
}

function computeScore(mode: SessionMode, lapNumber: number, laps: Lap[]): number | null {
  const slice = laps.slice(0, lapNumber)
  if (slice.length < lapNumber) return null

  if (mode === 'race') {
    return slice[slice.length - 1].cumulative
  } else {
    return Math.min(...slice.map(l => l.lapTime))
  }
}
