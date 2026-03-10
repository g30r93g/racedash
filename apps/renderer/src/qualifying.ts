import type { QualifyingDriver } from '@racedash/core'

export interface RankedDriver extends QualifyingDriver {
  best: number     // best completed lap time in seconds
  position: number // 1-indexed
}

/**
 * Build the leaderboard at `currentTime`.
 * Only drivers with at least one completed lap are included.
 * A lap is complete when ts.ytSeconds + ts.lap.lapTime <= currentTime.
 */
export function buildLeaderboard(drivers: QualifyingDriver[], currentTime: number): RankedDriver[] {
  const ranked: RankedDriver[] = []

  for (const d of drivers) {
    let best = Infinity
    for (const ts of d.timestamps) {
      if (ts.ytSeconds + ts.lap.lapTime <= currentTime) {
        if (ts.lap.lapTime < best) best = ts.lap.lapTime
      }
    }
    if (best !== Infinity) {
      ranked.push({ ...d, best, position: 0 })
    }
  }

  ranked.sort((a, b) => a.best - b.best)
  for (let i = 0; i < ranked.length; i++) ranked[i].position = i + 1
  return ranked
}

/**
 * Select the 4-row display window:
 * - Row 1: always P1 (pinned)
 * - Rows 2-4: 3-row window around ourKart, never duplicating P1
 * - If our driver IS P1: show [P1, P2, P3, P4]
 * - Falls back to top-4 if ourKart not in leaderboard
 */
export function selectWindow(leaderboard: RankedDriver[], ourKart: string): RankedDriver[] {
  if (leaderboard.length === 0) return []

  const ourIdx = leaderboard.findIndex(d => d.kart === ourKart)

  // Fallback or P1: show top-4
  if (ourIdx <= 0) return leaderboard.slice(0, Math.min(4, leaderboard.length))

  const last = leaderboard.length - 1

  // Window: one above our driver (min index 1 to avoid P1 duplication), our driver, one below
  let windowStart = Math.max(1, ourIdx - 1)
  let windowEnd = Math.min(last, ourIdx + 1)

  // Expand window to fill 3 slots if at boundary
  while (windowEnd - windowStart < 2) {
    if (windowStart > 1) windowStart--
    else if (windowEnd < last) windowEnd++
    else break
  }

  return [leaderboard[0], ...leaderboard.slice(windowStart, windowEnd + 1)]
}

/** Format a delta to P1 as "+0.456". */
export function formatDelta(lapTime: number, p1Time: number): string {
  const delta = lapTime - p1Time
  return `+${delta.toFixed(3)}`
}
