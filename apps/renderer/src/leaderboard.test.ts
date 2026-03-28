import { describe, it, expect } from 'vitest'
import type { LeaderboardDriver, RaceLapEntry, RaceLapSnapshot } from '@racedash/core'
import { buildLeaderboard, selectWindow, formatDelta, formatInterval } from './leaderboard'
import type { RankedDriver } from './leaderboard'

// Helper: driver with laps starting at videoStart
function driver(kart: string, videoStart: number, lapTimes: number[]): LeaderboardDriver {
  let ytSeconds = videoStart
  const timestamps = lapTimes.map((lapTime, i) => {
    const ts = { lap: { number: i + 1, lapTime, cumulative: lapTime }, ytSeconds }
    ytSeconds += lapTime
    return ts
  })
  return { kart, name: `Driver ${kart}`, timestamps }
}

// Three drivers: A starts at t=0, B at t=5, C at t=10
// All do laps of ~60s each
const A = driver('1', 0, [62.0, 61.0, 60.0]) // best: 60.0
const B = driver('2', 5, [61.5, 59.5, 61.0]) // best: 59.5 (fastest)
const C = driver('3', 10, [63.0, 60.5, 61.5]) // best: 60.5

// Lap completion times (ytSeconds + lapTime):
// A lap1 ends: 62.0, lap2: 123.0, lap3: 183.0
// B lap1 ends: 66.5, lap2: 126.0 (best 59.5), lap3: 187.0
// C lap1 ends: 73.0, lap2: 133.5 (best 60.5), lap3: 195.0

const DRIVERS = [A, B, C]

describe('buildLeaderboard', () => {
  it('returns empty array before any driver completes a lap', () => {
    expect(buildLeaderboard(DRIVERS, 60.0, 'qualifying')).toEqual([])
  })

  it('includes only drivers with at least one completed lap', () => {
    // At t=65, only A has completed lap 1 (ends at 62.0)
    const lb = buildLeaderboard(DRIVERS, 65.0, 'qualifying')
    expect(lb).toHaveLength(1)
    expect(lb[0].kart).toBe('1')
    expect(lb[0].position).toBe(1)
    expect(lb[0].best).toBeCloseTo(62.0)
  })

  it('sorts by best lap time ascending', () => {
    // At t=200, all 3 have completed all laps
    const lb = buildLeaderboard(DRIVERS, 200.0, 'qualifying')
    expect(lb).toHaveLength(3)
    expect(lb[0].kart).toBe('2') // B: best 59.5
    expect(lb[1].kart).toBe('1') // A: best 60.0
    expect(lb[2].kart).toBe('3') // C: best 60.5
  })

  it('assigns 1-indexed positions', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'qualifying')
    expect(lb.map((d) => d.position)).toEqual([1, 2, 3])
  })

  it('does not count a lap as complete until ytSeconds + lapTime <= currentTime', () => {
    // B lap2 ends at 5+61.5+59.5=126.0; at t=125.9 it is not yet complete
    const lb = buildLeaderboard(DRIVERS, 125.9, 'qualifying')
    const bEntry = lb.find((d) => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(61.5) // only lap1 (61.5) is complete, not lap2 (59.5)
  })

  it('updates best when a faster lap completes', () => {
    // B lap2 ends at 126.0 exactly
    const lb = buildLeaderboard(DRIVERS, 126.0, 'qualifying')
    const bEntry = lb.find((d) => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(59.5)
  })

  it('computes lapsCompleted for each driver in qualifying mode', () => {
    // At t=200, all 3 have completed all 3 laps
    const lb = buildLeaderboard(DRIVERS, 200.0, 'qualifying')
    expect(lb.find((d) => d.kart === '1')?.lapsCompleted).toBe(3) // A: 3 laps
    expect(lb.find((d) => d.kart === '2')?.lapsCompleted).toBe(3) // B: 3 laps
    expect(lb.find((d) => d.kart === '3')?.lapsCompleted).toBe(3) // C: 3 laps
  })

  it('sets interval to null for P1, delta string for others in qualifying mode', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'qualifying')
    expect(lb[0].interval).toBeNull() // P1 (B: best 59.5)
    expect(lb[1].interval).toBe('+0.500') // A: best 60.0, delta = +0.500
    expect(lb[2].interval).toBe('+1.000') // C: best 60.5, delta = +1.000
  })
})

describe('selectWindow', () => {
  // Build a 6-driver leaderboard
  const lb = Array.from({ length: 6 }, (_, i) => ({
    kart: String(i + 1),
    name: `Driver ${i + 1}`,
    timestamps: [],
    best: 60 + i,
    position: i + 1,
    lapsCompleted: 1,
    cumulativeTime: 60 + i,
    interval: i === 0 ? null : `+${i}.000`,
  }))

  it('P1: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '1')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P2: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '2')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P3: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '3')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P4 (middle): shows [P1, P3, P4, P5]', () => {
    const rows = selectWindow(lb, '4')
    expect(rows.map((d) => d.position)).toEqual([1, 3, 4, 5])
  })

  it('last (P6): shows [P1, P4, P5, P6]', () => {
    const rows = selectWindow(lb, '6')
    expect(rows.map((d) => d.position)).toEqual([1, 4, 5, 6])
  })

  it('returns all rows when leaderboard has fewer than 4', () => {
    const small = lb.slice(0, 2)
    const rows = selectWindow(small, '2')
    expect(rows.map((d) => d.position)).toEqual([1, 2])
  })

  it('returns top 4 as fallback if our kart is not in leaderboard', () => {
    const rows = selectWindow(lb, 'UNKNOWN')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3, 4])
  })

  it('3-driver leaderboard, our driver last: shows [P1, P2, P3]', () => {
    const small = lb.slice(0, 3)
    const rows = selectWindow(small, '3')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3])
  })
})

describe('formatDelta', () => {
  it('formats positive delta with + prefix and 3 decimals', () => {
    expect(formatDelta(60.456, 60.0)).toBe('+0.456')
  })

  it('returns +0.000 when times are equal (P1 calling formatDelta on themselves)', () => {
    expect(formatDelta(59.5, 59.5)).toBe('+0.000')
  })

  it('clamps to +0.000 if lapTime is less than p1Time (defensive)', () => {
    expect(formatDelta(59.0, 60.0)).toBe('+0.000')
  })
})

describe('formatInterval', () => {
  function makeEntry(lapsCompleted: number, cumulativeTime: number): RankedDriver {
    return {
      kart: 'X',
      name: 'X',
      timestamps: [],
      best: Infinity,
      lapsCompleted,
      cumulativeTime,
      position: 0,
      interval: null,
    }
  }

  it('same lap count: returns time gap with + prefix and 3 decimals', () => {
    const current = makeEntry(5, 126.0)
    const ahead = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+3.000')
  })

  it('one lap behind: returns "+1L"', () => {
    const current = makeEntry(4, 200.0)
    const ahead = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+1L')
  })

  it('two laps behind: returns "+2L"', () => {
    const current = makeEntry(3, 180.0)
    const ahead = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+2L')
  })

  it('clamps to +0.000 if current cumulative is somehow less than ahead (defensive)', () => {
    const current = makeEntry(5, 120.0)
    const ahead = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+0.000')
  })
})

// Build a 15-driver leaderboard for window tests (race mode)
function makeRaceLb(count: number): RankedDriver[] {
  return Array.from({ length: count }, (_, i) => ({
    kart: String(i + 1),
    name: `Driver ${i + 1}`,
    timestamps: [],
    best: Infinity,
    lapsCompleted: 10 - Math.floor(i / 5), // rough lap buckets
    cumulativeTime: 100 + i * 3,
    position: i + 1,
    interval: i === 0 ? null : `+${(i * 3).toFixed(3)}`,
  }))
}

describe('selectWindow (race mode)', () => {
  const lb15 = makeRaceLb(15)

  it('driver in top 10: returns positions 1-10', () => {
    const rows = selectWindow(lb15, '5', 'race')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('driver at P10: still returns top 10', () => {
    const rows = selectWindow(lb15, '10', 'race')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('driver at P11: P1 + P6..P10 + P11 + P12..P14 = 10 rows', () => {
    const rows = selectWindow(lb15, '11', 'race')
    expect(rows.map((d) => d.position)).toEqual([1, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })

  it('driver at P15 (last): P1 + P10..P14 + P15 + [] = 7 rows (fewer than 3 below)', () => {
    const rows = selectWindow(lb15, '15', 'race')
    expect(rows.map((d) => d.position)).toEqual([1, 10, 11, 12, 13, 14, 15])
  })

  it('returns empty when our kart not in leaderboard (race gate)', () => {
    const rows = selectWindow(lb15, 'UNKNOWN', 'race')
    expect(rows).toEqual([])
  })

  it('leaderboard of exactly 10: returns all', () => {
    const lb10 = makeRaceLb(10)
    const rows = selectWindow(lb10, '10', 'race')
    expect(rows.map((d) => d.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

// --- Race leaderboard tests ---
// Same drivers, but now treated as a race.
// A starts at t=0, B at t=5, C at t=10 (same timestamps as above).
// In a race: rank by laps completed desc, then cumulative time asc.

describe('buildLeaderboard (race mode)', () => {
  it('returns empty array before any driver completes a lap', () => {
    expect(buildLeaderboard(DRIVERS, 60.0, 'race')).toEqual([])
  })

  it('includes only drivers with at least one completed lap', () => {
    // At t=65, only A has completed lap 1 (ends at 62.0)
    const lb = buildLeaderboard(DRIVERS, 65.0, 'race')
    expect(lb).toHaveLength(1)
    expect(lb[0].kart).toBe('1')
    expect(lb[0].lapsCompleted).toBe(1)
    expect(lb[0].cumulativeTime).toBeCloseTo(62.0)
  })

  it('ranks by laps completed descending', () => {
    // At t=100: A has 1 lap (ends 62.0), B has 1 lap (ends 66.5)
    // A has lower cumulative, so A leads
    const lb = buildLeaderboard(DRIVERS, 100.0, 'race')
    expect(lb[0].kart).toBe('1') // A: 1 lap, 62.0s
    expect(lb[1].kart).toBe('2') // B: 1 lap, 66.5s
  })

  it('tiebreaks equal lap counts by cumulative time ascending', () => {
    // At t=130: A laps 1+2 (ends 62+61=123.0), B laps 1+2 (ends 66.5+59.5=126.0), C lap 1 (ends 73.0)
    const lb = buildLeaderboard(DRIVERS, 130.0, 'race')
    expect(lb[0].kart).toBe('1') // A: 2 laps, 123.0s cumulative
    expect(lb[1].kart).toBe('2') // B: 2 laps, 126.0s cumulative
    expect(lb[2].kart).toBe('3') // C: 1 lap, 73.0s end-time (lapped)
  })

  it('assigns 1-indexed positions', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'race')
    expect(lb.map((d) => d.position)).toEqual([1, 2, 3])
  })

  it('P1 interval is null', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'race')
    expect(lb[0].interval).toBeNull()
  })

  it('P2 interval shows gap to P1 in seconds when same laps', () => {
    // At t=130: A 2 laps 123.0s, B 2 laps 126.0s
    const lb = buildLeaderboard(DRIVERS, 130.0, 'race')
    // B interval = B cumulative - A cumulative = 126.0 - 123.0 = 3.0
    expect(lb[1].interval).toBe('+3.000')
  })

  it('shows "+NL" when a driver is laps behind the car ahead', () => {
    // At t=130: C has 1 lap, B has 2 laps → C is 1 lap behind B
    const lb = buildLeaderboard(DRIVERS, 130.0, 'race')
    expect(lb[2].interval).toBe('+1L')
  })
})

// --- Race leaderboard with ourKart (look-ahead mode) ---
// All drivers start at t=0 (as buildRaceDrivers produces).
// lap.cumulative = running sum of lap times.
function raceDriver(kart: string, lapTimes: number[]): LeaderboardDriver {
  let ytSeconds = 0
  let cumulative = 0
  const timestamps = lapTimes.map((lapTime, i) => {
    cumulative += lapTime
    const ts = { lap: { number: i + 1, lapTime, cumulative }, ytSeconds }
    ytSeconds += lapTime
    return ts
  })
  return { kart, name: `Driver ${kart}`, timestamps }
}

describe('buildLeaderboard (race mode, ourKart)', () => {
  // 7 drivers starting at t=0.  We are P7 on the grid (kart "7").
  // After lap 1 our position should be P6: 5 drivers beat us, one retired driver (kart "8")
  // had a faster lap 1 but only has 1 lap (no lap 2 data).
  const faster = ['1', '2', '3', '4', '5'].map((k) => raceDriver(k, [50 + Number(k), 55 + Number(k)]))
  const us = raceDriver('7', [58.0, 60.0]) // lap1=58s, lap2=60s → cumulative: 58, 118
  const retired = raceDriver('8', [57.0]) // lap1=57s only (retired) → cumulative: 57

  const allDrivers = [...faster, us, retired]
  // currentTime = our lap 1 end = 0 + 58 = 58s
  const t = 58.0

  it('ranks us P6 (not P7) when a retired driver beat our lap 1 time', () => {
    const lb = buildLeaderboard(allDrivers, t, 'race', '7')
    const ourRow = lb.find((d) => d.kart === '7')
    expect(ourRow?.position).toBe(6)
  })

  it('retired driver is ranked behind us (no lap 2 data)', () => {
    const lb = buildLeaderboard(allDrivers, t, 'race', '7')
    const retiredRow = lb.find((d) => d.kart === '8')
    const ourRow = lb.find((d) => d.kart === '7')
    expect(retiredRow?.position).toBeGreaterThan(ourRow?.position ?? 0)
  })

  it('interval to retired driver shows "+1L"', () => {
    const lb = buildLeaderboard(allDrivers, t, 'race', '7')
    const retiredRow = lb.find((d) => d.kart === '8')
    expect(retiredRow?.interval).toBe('+1L')
  })

  it('two finite-group drivers show a time interval, not "+NL"', () => {
    const lb = buildLeaderboard(allDrivers, t, 'race', '7')
    const ourRow = lb.find((d) => d.kart === '7')!
    // P5 driver (kart "5") lap1=55, lap2=60 → cumulativeTime = 115
    // our cumulativeTime = 118 → gap = 118 - 115 = 3.000
    expect(ourRow.interval).toMatch(/^\+\d+\.\d{3}$/)
  })
})

// ---------------------------------------------------------------------------
// Snapshot path tests
// ---------------------------------------------------------------------------

function makeSnapshot(videoTimestamp: number, entries: RaceLapEntry[]): RaceLapSnapshot {
  return { leaderLap: 1, videoTimestamp, entries }
}

describe('buildLeaderboard – snapshot path', () => {
  // Minimal entry helpers
  function entry(kart: string, position: number, lapsCompleted: number, intervalToAhead = '0.000'): RaceLapEntry {
    return { kart, name: `Driver ${kart}`, position, lapsCompleted, gapToLeader: '0.000', intervalToAhead }
  }

  // 1. raceLapSnapshots: undefined falls back to timing path
  it('raceLapSnapshots: undefined falls back to timing path', () => {
    expect(() => buildLeaderboard([], 0, 'race', undefined, undefined)).not.toThrow()
  })

  // 2. raceLapSnapshots: [] returns [] without fallback
  it('raceLapSnapshots: [] returns [] without fallback', () => {
    const result = buildLeaderboard([], 0, 'race', undefined, [])
    expect(result).toEqual([])
  })

  // 3. Returns [] when currentTime is before first snapshot
  it('returns [] when currentTime is before first snapshot', () => {
    const snapshots = [makeSnapshot(100, [entry('1', 1, 1, '')])]

    const result = buildLeaderboard([], 50, 'race', undefined, snapshots)
    expect(result).toEqual([])
  })

  // 4. Selects snapshot at exact boundary (inclusive)
  it('selects snapshot at exact boundary (inclusive)', () => {
    const snapshots = [makeSnapshot(100, [entry('1', 1, 1, ''), entry('2', 2, 1, '0.500')])]

    const result = buildLeaderboard([], 100, 'race', undefined, snapshots)
    expect(result.length).toBeGreaterThan(0)
  })

  // 5. Selects the latest snapshot where videoTimestamp <= currentTime
  it('selects the latest snapshot where videoTimestamp <= currentTime', () => {
    const snap1 = makeSnapshot(50, [entry('10', 1, 1, ''), entry('11', 2, 1, '1.000')])
    const snap2 = makeSnapshot(100, [entry('20', 1, 2, ''), entry('21', 2, 2, '2.000')])

    const result = buildLeaderboard([], 75, 'race', undefined, [snap1, snap2])
    // currentTime=75 → only snap1 (t=50) qualifies; snap2 (t=100) does not
    expect(result[0].kart).toBe('10')
  })

  // 6. P1 interval is null
  it('P1 interval is null', () => {
    const snapshots = [makeSnapshot(0, [entry('1', 1, 3, ''), entry('2', 2, 3, '1.000'), entry('3', 3, 3, '2.000')])]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[0].interval).toBeNull()
  })

  // 7. Same-lap interval: `+${intervalToAhead}`
  it('same-lap interval uses intervalToAhead from entry', () => {
    const snapshots = [makeSnapshot(0, [entry('1', 1, 5, ''), entry('2', 2, 5, '0.333')])]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[1].interval).toBe('+0.333')
  })

  // 8. Lapped by 1: "+1L"
  it('lapped by 1 lap shows "+1L"', () => {
    const snapshots = [makeSnapshot(0, [entry('1', 1, 1, ''), entry('2', 2, 0, '0.000')])]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[1].interval).toBe('+1L')
  })

  // 9. Lapped by multiple: "+3L"
  it('lapped by 3 laps shows "+3L"', () => {
    const snapshots = [makeSnapshot(0, [entry('1', 1, 3, ''), entry('2', 2, 0, '0.000')])]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[1].interval).toBe('+3L')
  })

  // 10. Empty intervalToAhead for non-P1 (malformed) → "+0.000"
  it('empty intervalToAhead for non-P1 falls back to "+0.000"', () => {
    const snapshots = [makeSnapshot(0, [entry('1', 1, 5, ''), entry('2', 2, 5, '')])]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[1].interval).toBe('+0.000')
  })

  // 11. entry.position === 1 used for P1 check, not array index
  it('uses entry.position for P1 check, not array index', () => {
    // Only one entry with position=3 (not P1) — should NOT get null interval
    const snapshots = [makeSnapshot(0, [entry('3', 3, 5, '1.234')])]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[0].interval).not.toBeNull()
  })

  // 12. ourKart has no effect on ordering
  it('ourKart has no effect on snapshot ordering', () => {
    const snapshots = [makeSnapshot(0, [entry('1', 1, 5, ''), entry('2', 2, 5, '0.500')])]

    const result = buildLeaderboard([], 0, 'race', '2', snapshots)
    expect(result[0].kart).toBe('1')
    expect(result[1].kart).toBe('2')
  })

  // 13. Result has correct kart, name, position, lapsCompleted fields
  it('maps kart, name, position, lapsCompleted directly from snapshot entry', () => {
    const snapshots = [
      makeSnapshot(0, [
        { kart: '42', name: 'Alice', position: 1, lapsCompleted: 7, gapToLeader: '0.000', intervalToAhead: '' },
      ]),
    ]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[0].kart).toBe('42')
    expect(result[0].name).toBe('Alice')
    expect(result[0].position).toBe(1)
    expect(result[0].lapsCompleted).toBe(7)
  })

  // 14. timestamps: [], best: Infinity, cumulativeTime: 0 are set as placeholders
  it('sets timestamps=[], best=Infinity, cumulativeTime=0 as placeholder values', () => {
    const snapshots = [makeSnapshot(0, [entry('1', 1, 5, '')])]

    const result = buildLeaderboard([], 0, 'race', undefined, snapshots)
    expect(result[0].timestamps).toEqual([])
    expect(result[0].best).toBe(Infinity)
    expect(result[0].cumulativeTime).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Snapshot resolution by driver lap count
// ---------------------------------------------------------------------------

describe('buildLeaderboard – snapshot path, latest matching lap-count snapshot', () => {
  function entry(kart: string, position: number, lapsCompleted: number, intervalToAhead = '0.000'): RaceLapEntry {
    return { kart, name: `Driver ${kart}`, position, lapsCompleted, gapToLeader: '0.000', intervalToAhead }
  }

  const snap1 = { leaderLap: 1, videoTimestamp: 100, entries: [entry('1', 1, 1, ''), entry('2', 2, 0, '0.000')] }
  const snap2 = { leaderLap: 2, videoTimestamp: 200, entries: [entry('1', 1, 2, ''), entry('2', 2, 1, '2.000')] }
  const snap3 = { leaderLap: 3, videoTimestamp: 300, entries: [entry('1', 2, 3, '1.500'), entry('2', 1, 2, '')] }

  // Driver 1 leads early and crosses at t=100,200,300.
  // Driver 2 crosses at t=105, 295, 405, so by t=300 they have completed 2 laps.
  const d1 = driver('1', 0, [100, 100, 100])
  const d2 = driver('2', 0, [105, 190, 110])

  it('uses the latest active snapshot entry that matches the driver lap count', () => {
    const result = buildLeaderboard([d1, d2], 300.1, 'race', undefined, [snap1, snap2, snap3])
    const p1 = result.find((r) => r.kart === '2')!
    expect(p1.position).toBe(1)
    expect(p1.lapsCompleted).toBe(2)
  })

  it('does not lag one snapshot behind when a newer active snapshot matches the same lap count', () => {
    const result = buildLeaderboard([d1, d2], 300.1, 'race', undefined, [snap1, snap2, snap3])
    const row = result.find((r) => r.kart === '2')!
    expect(row.position).toBe(1)
    expect(row.interval).toBeNull()
  })

  it('falls back to the active snapshot when driver timing data is unavailable', () => {
    const result = buildLeaderboard([], 300.1, 'race', undefined, [snap1, snap2, snap3])
    const row = result.find((r) => r.kart === '2')!
    expect(row.position).toBe(1)
    expect(row.lapsCompleted).toBe(2)
  })
})
