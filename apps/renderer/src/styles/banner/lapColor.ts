import type { Lap } from '@racedash/core'

export type LapColor = 'purple' | 'green' | 'red'

/**
 * For each of the target driver's laps, determines the display color on completion:
 *   purple — new personal best AND the fastest lap in the session at that point
 *   green  — new personal best but another driver has gone faster
 *   red    — not a new personal best
 *
 * "Session best at lap N" = minimum lapTime among all laps (any driver) whose
 * cumulative time is <= the target lap's cumulative time. This assumes all drivers
 * start at the same time, which holds for karting group sessions.
 */
/**
 * @param targetLaps - Must be in ascending cumulative-time order (session.laps always satisfies this).
 * @param sessionAllLaps - Must include the target driver's own laps; because the session-best window
 *   uses a `<=` boundary on cumulative time, the target's lap is itself part of the window and must
 *   be present so the `purple` (session-best) check works correctly.
 */
export function computeLapColors(targetLaps: Lap[], sessionAllLaps: Lap[][]): LapColor[] {
  if (targetLaps.length === 0) return []

  // Sort all session laps once — O(n log n). targetLaps must already be
  // in ascending cumulative order (guaranteed by session.laps construction).
  const allLaps = sessionAllLaps.flat().sort((a, b) => a.cumulative - b.cumulative)

  let personalBest = Infinity
  let sessionBest = Infinity
  let j = 0

  return targetLaps.map(lap => {
    // Advance pointer to include every session lap whose cumulative time
    // is <= this lap's cumulative — i.e. laps that had already occurred.
    while (j < allLaps.length && allLaps[j].cumulative <= lap.cumulative) {
      sessionBest = Math.min(sessionBest, allLaps[j].lapTime)
      j++
    }

    const isPersonalBest = lap.lapTime < personalBest
    personalBest = Math.min(personalBest, lap.lapTime)

    if (!isPersonalBest) return 'red'
    return lap.lapTime <= sessionBest ? 'purple' : 'green'
  })
}
