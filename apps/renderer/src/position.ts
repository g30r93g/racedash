import type { Lap, SessionMode } from '@racedash/core'

/**
 * Compute race position at the end of `lapNumber`.
 *
 * Race: rank by cumulative time at lap N (lower = better).
 * Practice/Qualifying: rank by best lap time through lap N (lower = better).
 *
 * Drivers without N laps completed are excluded from comparison.
 *
 * @param currentLaps - Must be the same array reference that appears in `sessionAllLaps`.
 *   The function skips it by reference equality to avoid double-counting the current driver.
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
  if (lapNumber < 1 || laps.length < lapNumber) return null

  if (mode === 'race') {
    return laps[lapNumber - 1].cumulative
  }

  // practice / qualifying: best lap time through lapNumber
  let best = Infinity
  for (let i = 0; i < lapNumber; i++) best = Math.min(best, laps[i].lapTime)
  return best
}
