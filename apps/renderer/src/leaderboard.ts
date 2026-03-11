import type { LeaderboardDriver } from '@racedash/core'

export type LeaderboardMode = 'qualifying' | 'practice' | 'race'

export interface RankedDriver extends LeaderboardDriver {
  position: number
  best: number           // best completed lap time (qualifying/practice); Infinity if none
  lapsCompleted: number  // total completed laps at currentTime
  cumulativeTime: number // qualifying/practice: sum of completed lap durations; race: absolute video end-time of last completed lap
  interval: string | null // pre-computed time column string; null for P1
}

/**
 * Build the leaderboard at `currentTime`.
 * Only drivers with at least one completed lap are included.
 * A lap is complete when ts.ytSeconds + ts.lap.lapTime <= currentTime.
 */
export function buildLeaderboard(
  drivers: LeaderboardDriver[],
  currentTime: number,
  mode: LeaderboardMode,
): RankedDriver[] {
  if (mode === 'race') return buildRaceLeaderboard(drivers, currentTime)

  // qualifying / practice: rank by best lap time
  const ranked: RankedDriver[] = []
  for (const d of drivers) {
    let best = Infinity
    let lapsCompleted = 0
    let cumulativeTime = 0
    for (const ts of d.timestamps) {
      if (ts.ytSeconds + ts.lap.lapTime <= currentTime) {
        lapsCompleted++
        cumulativeTime += ts.lap.lapTime
        if (ts.lap.lapTime < best) best = ts.lap.lapTime
      }
    }
    if (best !== Infinity) {
      ranked.push({ ...d, best, lapsCompleted, cumulativeTime, position: 0, interval: null })
    }
  }
  ranked.sort((a, b) => a.best - b.best)
  for (let i = 0; i < ranked.length; i++) {
    ranked[i].position = i + 1
    ranked[i].interval = i === 0 ? null : formatDelta(ranked[i].best, ranked[0].best)
  }
  return ranked
}

/**
 * Select the display window for the overlay.
 *
 * Race mode (10-row):
 * - P1-P10: show the first 10 entries
 * - P11+: [P1] + 5 entries directly above + our entry + up to 3 below
 * - Driver not in leaderboard: return [] (gates display until first lap completes)
 *
 * Qualifying / practice mode (4-row):
 * - Row 1: always P1 (pinned)
 * - Rows 2-4: 3-row window around ourKart, never duplicating P1
 * - If our driver IS P1: show [P1, P2, P3, P4]
 * - Falls back to top-4 if ourKart not in leaderboard
 */
export function selectWindow(
  leaderboard: RankedDriver[],
  ourKart: string,
  mode: LeaderboardMode = 'qualifying',
): RankedDriver[] {
  if (leaderboard.length === 0) return []

  if (mode === 'race') {
    const ourIdx = leaderboard.findIndex(d => d.kart === ourKart)
    if (ourIdx === -1) return []
    // Within top 10: show 1-10
    if (ourIdx < 10) return leaderboard.slice(0, Math.min(10, leaderboard.length))
    // P11+: P1 + 5 above + our driver + 3 below
    const above = leaderboard.slice(Math.max(1, ourIdx - 5), ourIdx)
    const below = leaderboard.slice(ourIdx + 1, ourIdx + 4)
    return [leaderboard[0], ...above, leaderboard[ourIdx], ...below]
  }

  // qualifying / practice: existing 4-row logic
  const ourIdx = leaderboard.findIndex(d => d.kart === ourKart)
  if (ourIdx <= 0) return leaderboard.slice(0, Math.min(4, leaderboard.length))

  const last = leaderboard.length - 1
  let windowStart = Math.max(1, ourIdx - 1)
  let windowEnd = Math.min(last, ourIdx + 1)
  while (windowEnd - windowStart < 2) {
    if (windowStart > 1) windowStart--
    else if (windowEnd < last) windowEnd++
    else break
  }
  return [leaderboard[0], ...leaderboard.slice(windowStart, windowEnd + 1)]
}

/** Format a delta to P1 as "+0.456". */
export function formatDelta(lapTime: number, p1Time: number): string {
  const delta = Math.max(0, lapTime - p1Time)
  return `+${delta.toFixed(3)}`
}

/** Format interval to car directly ahead. Same laps → "+X.XXX". Laps behind → "+NL". */
export function formatInterval(current: RankedDriver, ahead: RankedDriver): string {
  const lapDiff = ahead.lapsCompleted - current.lapsCompleted
  if (lapDiff > 0) return `+${lapDiff}L`
  const timeDiff = Math.max(0, current.cumulativeTime - ahead.cumulativeTime)
  return `+${timeDiff.toFixed(3)}`
}

function buildRaceLeaderboard(drivers: LeaderboardDriver[], currentTime: number): RankedDriver[] {
  const ranked: RankedDriver[] = []

  for (const d of drivers) {
    let lapsCompleted = 0
    let cumulativeTime = 0
    for (const ts of d.timestamps) {
      const endTime = ts.ytSeconds + ts.lap.lapTime
      if (endTime <= currentTime) {
        lapsCompleted++
        cumulativeTime = endTime
      }
    }
    if (lapsCompleted > 0) {
      ranked.push({ ...d, best: Infinity, lapsCompleted, cumulativeTime, position: 0, interval: null })
    }
  }

  ranked.sort((a, b) =>
    b.lapsCompleted !== a.lapsCompleted
      ? b.lapsCompleted - a.lapsCompleted
      : a.cumulativeTime - b.cumulativeTime,
  )

  for (let i = 0; i < ranked.length; i++) {
    ranked[i].position = i + 1
    ranked[i].interval = i === 0 ? null : formatInterval(ranked[i], ranked[i - 1])
  }

  return ranked
}
