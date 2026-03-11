import { describe, it, expect } from 'vitest'
import type { QualifyingDriver } from '@racedash/core'
import { buildLeaderboard, selectWindow, formatDelta, formatInterval } from './leaderboard'
import type { RankedDriver } from './leaderboard'

// Helper: driver with laps starting at videoStart
function driver(kart: string, videoStart: number, lapTimes: number[]): QualifyingDriver {
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
const A = driver('1', 0, [62.0, 61.0, 60.0])   // best: 60.0
const B = driver('2', 5, [61.5, 59.5, 61.0])   // best: 59.5 (fastest)
const C = driver('3', 10, [63.0, 60.5, 61.5])  // best: 60.5

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
    expect(lb[0].kart).toBe('2')  // B: best 59.5
    expect(lb[1].kart).toBe('1')  // A: best 60.0
    expect(lb[2].kart).toBe('3')  // C: best 60.5
  })

  it('assigns 1-indexed positions', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'qualifying')
    expect(lb.map(d => d.position)).toEqual([1, 2, 3])
  })

  it('does not count a lap as complete until ytSeconds + lapTime <= currentTime', () => {
    // B lap2 ends at 5+61.5+59.5=126.0; at t=125.9 it is not yet complete
    const lb = buildLeaderboard(DRIVERS, 125.9, 'qualifying')
    const bEntry = lb.find(d => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(61.5)  // only lap1 (61.5) is complete, not lap2 (59.5)
  })

  it('updates best when a faster lap completes', () => {
    // B lap2 ends at 126.0 exactly
    const lb = buildLeaderboard(DRIVERS, 126.0, 'qualifying')
    const bEntry = lb.find(d => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(59.5)
  })

  it('computes lapsCompleted for each driver in qualifying mode', () => {
    // At t=200, all 3 have completed all 3 laps
    const lb = buildLeaderboard(DRIVERS, 200.0, 'qualifying')
    expect(lb.find(d => d.kart === '1')?.lapsCompleted).toBe(3) // A: 3 laps
    expect(lb.find(d => d.kart === '2')?.lapsCompleted).toBe(3) // B: 3 laps
    expect(lb.find(d => d.kart === '3')?.lapsCompleted).toBe(3) // C: 3 laps
  })

  it('sets interval to null for P1, delta string for others in qualifying mode', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0, 'qualifying')
    expect(lb[0].interval).toBeNull()       // P1 (B: best 59.5)
    expect(lb[1].interval).toBe('+0.500')   // A: best 60.0, delta = +0.500
    expect(lb[2].interval).toBe('+1.000')   // C: best 60.5, delta = +1.000
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
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P2: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '2')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P3: shows [P1, P2, P3, P4]', () => {
    const rows = selectWindow(lb, '3')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })

  it('P4 (middle): shows [P1, P3, P4, P5]', () => {
    const rows = selectWindow(lb, '4')
    expect(rows.map(d => d.position)).toEqual([1, 3, 4, 5])
  })

  it('last (P6): shows [P1, P4, P5, P6]', () => {
    const rows = selectWindow(lb, '6')
    expect(rows.map(d => d.position)).toEqual([1, 4, 5, 6])
  })

  it('returns all rows when leaderboard has fewer than 4', () => {
    const small = lb.slice(0, 2)
    const rows = selectWindow(small, '2')
    expect(rows.map(d => d.position)).toEqual([1, 2])
  })

  it('returns top 4 as fallback if our kart is not in leaderboard', () => {
    const rows = selectWindow(lb, 'UNKNOWN')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3, 4])
  })

  it('3-driver leaderboard, our driver last: shows [P1, P2, P3]', () => {
    const small = lb.slice(0, 3)
    const rows = selectWindow(small, '3')
    expect(rows.map(d => d.position)).toEqual([1, 2, 3])
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
    return { kart: 'X', name: 'X', timestamps: [], best: Infinity, lapsCompleted, cumulativeTime, position: 0, interval: null }
  }

  it('same lap count: returns time gap with + prefix and 3 decimals', () => {
    const current = makeEntry(5, 126.0)
    const ahead   = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+3.000')
  })

  it('one lap behind: returns "+1L"', () => {
    const current = makeEntry(4, 200.0)
    const ahead   = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+1L')
  })

  it('two laps behind: returns "+2L"', () => {
    const current = makeEntry(3, 180.0)
    const ahead   = makeEntry(5, 123.0)
    expect(formatInterval(current, ahead)).toBe('+2L')
  })

  it('clamps to +0.000 if current cumulative is somehow less than ahead (defensive)', () => {
    const current = makeEntry(5, 120.0)
    const ahead   = makeEntry(5, 123.0)
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
    expect(rows.map(d => d.position)).toEqual([1,2,3,4,5,6,7,8,9,10])
  })

  it('driver at P10: still returns top 10', () => {
    const rows = selectWindow(lb15, '10', 'race')
    expect(rows.map(d => d.position)).toEqual([1,2,3,4,5,6,7,8,9,10])
  })

  it('driver at P11: P1 + P6..P10 + P11 + P12..P14 = 10 rows', () => {
    const rows = selectWindow(lb15, '11', 'race')
    expect(rows.map(d => d.position)).toEqual([1, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })

  it('driver at P15 (last): P1 + P10..P14 + P15 + [] = 7 rows (fewer than 3 below)', () => {
    const rows = selectWindow(lb15, '15', 'race')
    expect(rows.map(d => d.position)).toEqual([1, 10, 11, 12, 13, 14, 15])
  })

  it('returns empty when our kart not in leaderboard (race gate)', () => {
    const rows = selectWindow(lb15, 'UNKNOWN', 'race')
    expect(rows).toEqual([])
  })

  it('leaderboard of exactly 10: returns all', () => {
    const lb10 = makeRaceLb(10)
    const rows = selectWindow(lb10, '10', 'race')
    expect(rows.map(d => d.position)).toEqual([1,2,3,4,5,6,7,8,9,10])
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
    expect(lb.map(d => d.position)).toEqual([1, 2, 3])
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
