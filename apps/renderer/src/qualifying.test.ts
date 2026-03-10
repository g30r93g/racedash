import { describe, it, expect } from 'vitest'
import type { QualifyingDriver } from '@racedash/core'
import { buildLeaderboard, selectWindow, formatDelta } from './qualifying'

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
    expect(buildLeaderboard(DRIVERS, 60.0)).toEqual([])
  })

  it('includes only drivers with at least one completed lap', () => {
    // At t=65, only A has completed lap 1 (ends at 62.0)
    const lb = buildLeaderboard(DRIVERS, 65.0)
    expect(lb).toHaveLength(1)
    expect(lb[0].kart).toBe('1')
    expect(lb[0].position).toBe(1)
    expect(lb[0].best).toBeCloseTo(62.0)
  })

  it('sorts by best lap time ascending', () => {
    // At t=200, all 3 have completed all laps
    const lb = buildLeaderboard(DRIVERS, 200.0)
    expect(lb).toHaveLength(3)
    expect(lb[0].kart).toBe('2')  // B: best 59.5
    expect(lb[1].kart).toBe('1')  // A: best 60.0
    expect(lb[2].kart).toBe('3')  // C: best 60.5
  })

  it('assigns 1-indexed positions', () => {
    const lb = buildLeaderboard(DRIVERS, 200.0)
    expect(lb.map(d => d.position)).toEqual([1, 2, 3])
  })

  it('does not count a lap as complete until ytSeconds + lapTime <= currentTime', () => {
    // B lap2 ends at 5+61.5+59.5=126.0; at t=125.9 it is not yet complete
    const lb = buildLeaderboard(DRIVERS, 125.9)
    const bEntry = lb.find(d => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(61.5)  // only lap1 (61.5) is complete, not lap2 (59.5)
  })

  it('updates best when a faster lap completes', () => {
    // B lap2 ends at 126.0 exactly
    const lb = buildLeaderboard(DRIVERS, 126.0)
    const bEntry = lb.find(d => d.kart === '2')
    expect(bEntry?.best).toBeCloseTo(59.5)
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
})

describe('formatDelta', () => {
  it('formats positive delta with + prefix and 3 decimals', () => {
    expect(formatDelta(60.456, 60.0)).toBe('+0.456')
  })

  it('returns +0.000 when times are equal (P1 calling formatDelta on themselves)', () => {
    expect(formatDelta(59.5, 59.5)).toBe('+0.000')
  })
})
