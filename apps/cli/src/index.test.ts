import { describe, it, expect } from 'vitest'
import type { ReplayLapData, ReplayLapEntry } from '@racedash/scraper'
import { buildRaceLapSnapshots } from './index'

function makeEntry(position: number, kart: string, totalSeconds: number | null): ReplayLapEntry {
  return {
    driverId: position * 100,
    position,
    kart,
    name: `Driver${kart}`,
    lapsCompleted: 1,
    totalSeconds,
    gapToLeader: position === 1 ? '0.000' : '0.500',
    intervalToAhead: position === 1 ? '' : '0.500',
  }
}

describe('buildRaceLapSnapshots', () => {
  it('skips index 0 (pre-race snapshot)', () => {
    const replayData: ReplayLapData = [
      [makeEntry(1, '1', 0), makeEntry(2, '2', 0.5)],
      [makeEntry(1, '1', 60.0), makeEntry(2, '2', 60.5)],
    ]
    const result = buildRaceLapSnapshots(replayData, 0)
    expect(result).toHaveLength(1)
    expect(result[0].leaderLap).toBe(1)
  })

  it('computes videoTimestamp = offsetSeconds + P1 totalSeconds', () => {
    const replayData: ReplayLapData = [
      [makeEntry(1, '1', 0)],
      [makeEntry(1, '1', 69.707), makeEntry(2, '2', 70.207)],
    ]
    const result = buildRaceLapSnapshots(replayData, 100)
    expect(result).toHaveLength(1)
    expect(result[0].videoTimestamp).toBe(169.707)
  })

  it('skips snapshot where P1 totalSeconds is null', () => {
    const replayData: ReplayLapData = [
      [makeEntry(1, '1', 0)],
      [makeEntry(1, '1', null), makeEntry(2, '2', null)],
      [makeEntry(1, '1', 120.5), makeEntry(2, '2', 121.0)],
    ]
    const result = buildRaceLapSnapshots(replayData, 0)
    expect(result).toHaveLength(1)
    expect(result[0].leaderLap).toBe(2)
  })

  it('returns [] if all snapshots have null P1 totalSeconds', () => {
    const replayData: ReplayLapData = [
      [makeEntry(1, '1', 0)],
      [makeEntry(1, '1', null), makeEntry(2, '2', null)],
    ]
    const result = buildRaceLapSnapshots(replayData, 0)
    expect(result).toEqual([])
  })

  it('mapped RaceLapEntry omits totalSeconds and driverId', () => {
    const replayData: ReplayLapData = [
      [makeEntry(1, '1', 0)],
      [makeEntry(1, '1', 60.0), makeEntry(2, '2', 60.5)],
    ]
    const result = buildRaceLapSnapshots(replayData, 0)
    expect(result).toHaveLength(1)
    const entry = result[0].entries[0]
    expect(entry).toHaveProperty('kart')
    expect(entry).toHaveProperty('name')
    expect(entry).toHaveProperty('position')
    expect(entry).toHaveProperty('lapsCompleted')
    expect(entry).toHaveProperty('gapToLeader')
    expect(entry).toHaveProperty('intervalToAhead')
    expect(entry).not.toHaveProperty('totalSeconds')
    expect(entry).not.toHaveProperty('driverId')
  })
})
