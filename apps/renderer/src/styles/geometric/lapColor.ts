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
export function computeLapColors(targetLaps: Lap[], sessionAllLaps: Lap[][]): LapColor[] {
  const allLaps = sessionAllLaps.flat()
  let personalBest = Infinity

  return targetLaps.map(lap => {
    const sessionBest = allLaps
      .filter(l => l.cumulative <= lap.cumulative)
      .reduce((min, l) => Math.min(min, l.lapTime), Infinity)

    const isPersonalBest = lap.lapTime < personalBest
    personalBest = Math.min(personalBest, lap.lapTime)

    if (!isPersonalBest) return 'red'
    return lap.lapTime <= sessionBest ? 'purple' : 'green' // <= is intentional: target is included in sessionAllLaps, so if no one else is faster, sessionBest === lap.lapTime
  })
}
