import { describe, it, expect } from 'vitest'
import type { ReplayLapData, ReplayLapEntry } from '@racedash/scraper'
import {
  buildRaceLapSnapshots,
  getRenderExperimentalWarning,
  resolveOutputResolutionPreset,
  resolvePositionOverrides,
  validatePositionOverrideConfig,
} from './index'

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

describe('validatePositionOverrideConfig', () => {
  it('returns undefined when overrides are omitted', () => {
    expect(validatePositionOverrideConfig(undefined, 'race', 0)).toBeUndefined()
  })

  it('treats an empty array as a no-op', () => {
    expect(validatePositionOverrideConfig([], 'race', 0)).toEqual([])
  })

  it('keeps timestamp strings intact until fps is known', () => {
    expect(
      validatePositionOverrideConfig(
        [
          { timestamp: '6:02.345', position: 6 },
          { timestamp: '2463 F', position: 5 },
        ],
        'race',
        0,
      ),
    ).toEqual([
      { timestamp: '6:02.345', position: 6 },
      { timestamp: '2463 F', position: 5 },
    ])
  })

  it('rejects overrides on non-race segments', () => {
    expect(() =>
      validatePositionOverrideConfig([{ timestamp: '6:02.345', position: 6 }], 'qualifying', 0),
    ).toThrow('only valid for race segments')
  })

  it('rejects invalid positions', () => {
    expect(() =>
      validatePositionOverrideConfig([{ timestamp: '6:02.345', position: 0 }], 'race', 0),
    ).toThrow('position must be an integer >= 1')
  })
})

describe('resolvePositionOverrides', () => {
  it('returns undefined when overrides are omitted', () => {
    expect(resolvePositionOverrides(undefined, 300, 0)).toBeUndefined()
  })

  it('treats an empty array as a no-op', () => {
    expect(resolvePositionOverrides([], 300, 0)).toEqual([])
  })

  it('parses time-based override timestamps into numeric seconds', () => {
    expect(
      resolvePositionOverrides(
        [
          { timestamp: '6:02.345', position: 6 },
          { timestamp: '8:15.000', position: 5 },
        ],
        300,
        0,
      ),
    ).toEqual([
      { timestamp: 362.345, position: 6 },
      { timestamp: 495, position: 5 },
    ])
  })

  it('parses frame-based override timestamps using fps', () => {
    expect(
      resolvePositionOverrides(
        [
          { timestamp: '2463 F', position: 6 },
          { timestamp: '8320 F', position: 5 },
        ],
        40,
        0,
        60,
      ),
    ).toEqual([
      { timestamp: 41.05, position: 6 },
      { timestamp: 138.66666666666666, position: 5 },
    ])
  })

  it('rejects unsorted timestamps', () => {
    expect(() =>
      resolvePositionOverrides(
        [
          { timestamp: '8:15.000', position: 5 },
          { timestamp: '6:02.345', position: 6 },
        ],
        300,
        0,
      ),
    ).toThrow('must be sorted ascending by timestamp')
  })

  it('rejects overrides before the segment offset', () => {
    expect(() =>
      resolvePositionOverrides(
        [{ timestamp: '4:59.999', position: 6 }],
        300,
        0,
      ),
    ).toThrow('timestamp must be >= the segment offset')
  })
})

describe('resolveOutputResolutionPreset', () => {
  it('returns undefined when the flag is omitted', () => {
    expect(resolveOutputResolutionPreset(undefined)).toBeUndefined()
  })

  it('maps 1440p to 2560x1440', () => {
    expect(resolveOutputResolutionPreset('1440p')).toEqual({
      preset: '1440p',
      width: 2560,
      height: 1440,
    })
  })

  it('rejects unsupported presets', () => {
    expect(() => resolveOutputResolutionPreset('720p')).toThrow(
      '--output-resolution must be one of: 1080p, 1440p, 2160p',
    )
  })
})

describe('getRenderExperimentalWarning', () => {
  it('returns the Windows experimental warning on win32', () => {
    expect(getRenderExperimentalWarning('win32')).toContain('experimental')
  })

  it('returns nothing on non-Windows platforms', () => {
    expect(getRenderExperimentalWarning('darwin')).toBeUndefined()
  })
})
