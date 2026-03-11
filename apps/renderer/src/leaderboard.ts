import type { LeaderboardDriver, RaceLapEntry, RaceLapSnapshot } from '@racedash/core'

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
 *
 * In race mode, pass `ourKart` to align ranking with PositionCounter: positions are
 * computed at lap (ourLapsCompleted + 1), matching getPosition(race, currentIdx+1, …).
 * Drivers without that lap's data (retired, short race) are sorted to the back.
 */
export function buildLeaderboard(
  drivers: LeaderboardDriver[],
  currentTime: number,
  mode: LeaderboardMode,
  ourKart?: string,
  raceLapSnapshots?: RaceLapSnapshot[],
): RankedDriver[] {
  if (mode === 'race') {
    if (raceLapSnapshots !== undefined) {
      return buildRaceLeaderboardFromSnapshots(raceLapSnapshots, currentTime, ourKart)
    }
    return buildRaceLeaderboard(drivers, currentTime, ourKart)
  }

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

function buildRaceLeaderboardFromSnapshots(
  snapshots: RaceLapSnapshot[],
  currentTime: number,
  ourKart?: string,
): RankedDriver[] {
  // Find the last snapshot where videoTimestamp <= currentTime
  let active: RaceLapSnapshot | undefined
  for (const snap of snapshots) {
    if (snap.videoTimestamp <= currentTime) active = snap
  }
  if (!active) return []

  const { entries } = active
  return entries.map((entry, i) => {
    let interval: string | null
    if (entry.position === 1) {
      interval = null
    } else {
      const ahead = entries[i - 1]
      if (!ahead) {
        interval = entry.intervalToAhead === '' ? '+0.000' : `+${entry.intervalToAhead}`
      } else {
        const lapDiff = ahead.lapsCompleted - entry.lapsCompleted
        if (lapDiff > 0) {
          interval = `+${lapDiff}L`
        } else if (lapDiff < 0) {
          // Impossible in well-formed data; defensive fallback
          interval = '+0.000'
        } else if (entry.intervalToAhead === '') {
          // Malformed non-P1 data
          interval = '+0.000'
        } else {
          interval = `+${entry.intervalToAhead}`
        }
      }
    }
    return {
      kart: entry.kart,
      name: entry.name,
      timestamps: [],
      position: entry.position,
      best: Infinity,
      lapsCompleted: entry.lapsCompleted,
      cumulativeTime: 0,
      interval,
    }
  })
}

function buildRaceLeaderboard(
  drivers: LeaderboardDriver[],
  currentTime: number,
  ourKart?: string,
): RankedDriver[] {
  // First pass: determine how many laps each driver has completed by currentTime.
  const driverState: Array<{
    driver: LeaderboardDriver
    lapsCompleted: number
    lastCumulative: number  // race-relative cumulative of last completed lap
    lastEndTime: number     // absolute video end-time of last completed lap (for fallback)
  }> = []

  for (const d of drivers) {
    let lapsCompleted = 0
    let lastCumulative = 0
    let lastEndTime = 0
    for (const ts of d.timestamps) {
      const endTime = ts.ytSeconds + ts.lap.lapTime
      if (endTime <= currentTime) {
        lapsCompleted++
        lastCumulative = ts.lap.cumulative
        lastEndTime = endTime
      }
    }
    if (lapsCompleted > 0) {
      driverState.push({ driver: d, lapsCompleted, lastCumulative, lastEndTime })
    }
  }

  if (driverState.length === 0) return []

  // When ourKart is provided and found, mirror PositionCounter's look-ahead: rank by
  // lap (ourLapsCompleted + 1) cumulative — the lap currently being driven.  This
  // matches getPosition(race, currentIdx+1, …) so that retired/short-lap drivers who
  // beat us in lap N but lack lap N+1 data don't rank above us.
  const ourState = ourKart ? driverState.find(s => s.driver.kart === ourKart) : undefined

  if (ourState) {
    const ourLapsCompleted = ourState.lapsCompleted
    // targetLapIdx (0-based) = ourLapsCompleted; the 1-based lap number is ourLapsCompleted+1.
    const targetLapIdx = ourLapsCompleted

    type Scored = (typeof driverState)[number] & { score: number }
    const scored: Scored[] = driverState.map(s => ({
      ...s,
      score: s.driver.timestamps[targetLapIdx]?.lap.cumulative ?? Infinity,
    }))

    // Finite-score drivers (have target-lap data) sort by score ASC.
    // Infinity-score drivers (retired/short) sort by lapsCompleted DESC then lastCumulative ASC.
    scored.sort((a, b) => {
      const aFin = isFinite(a.score)
      const bFin = isFinite(b.score)
      if (aFin !== bFin) return aFin ? -1 : 1
      if (aFin) return a.score - b.score
      if (a.lapsCompleted !== b.lapsCompleted) return b.lapsCompleted - a.lapsCompleted
      return a.lastCumulative - b.lastCumulative
    })

    // Normalise lapsCompleted for the finite group so that formatInterval shows time
    // gaps (not "+NL") between two finite-group drivers, while Infinity-group drivers
    // still show the correct lap delta relative to the finite group.
    const normLaps = ourLapsCompleted + 1

    const ranked: RankedDriver[] = scored.map(({ driver, lapsCompleted, lastCumulative, score }, i) => ({
      ...driver,
      best: Infinity,
      lapsCompleted: isFinite(score) ? normLaps : lapsCompleted,
      cumulativeTime: isFinite(score) ? score : lastCumulative,
      position: i + 1,
      interval: null,
    }))

    for (let i = 1; i < ranked.length; i++) {
      ranked[i].interval = formatInterval(ranked[i], ranked[i - 1])
    }

    return ranked
  }

  // Fallback (no ourKart): original "most laps first, then endTime" ranking.
  const ranked: RankedDriver[] = driverState.map(({ driver, lapsCompleted, lastEndTime }) => ({
    ...driver,
    best: Infinity,
    lapsCompleted,
    cumulativeTime: lastEndTime,
    position: 0,
    interval: null,
  }))

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
