import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DriverRow, ReplayLapData, ReplayLapEntry } from '@racedash/scraper'
import {
  buildRaceLapSnapshots,
  buildSessionSegments,
  driverListsAreIdentical,
  extractSpeedhiveSessionId,
  filterDriverHighlights,
  loadTimingConfig,
  resolvePositionOverrides,
  resolveTimingSegments,
  validateManualTimingData,
  validatePositionOverrideConfig,
  type TimingConfig,
} from './timingSources'

const teamsportFixture = join(__dirname, '__fixtures__', 'teamsport_sample.eml')
const daytona2025Fixture = join(__dirname, '__fixtures__', 'daytona_sample_2025.eml')
const daytona2026Fixture = join(__dirname, '__fixtures__', 'daytona_sample_2026.eml')

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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadTimingConfig', () => {
  it('rejects configs without an explicit source', async () => {
    const configPath = await writeTempConfig({
      driver: 'Alice',
      segments: [{ mode: 'practice', offset: '1:00.000', url: 'https://example.com' }],
    })

    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('valid "source"')
  })

  it('rejects timingData on non-manual sources', async () => {
    const configPath = await writeTempConfig({
      driver: 'Alice',
      segments: [{
        source: 'alphaTiming',
        mode: 'practice',
        offset: '1:00.000',
        url: 'https://results.alphatiming.co.uk/session/1',
        timingData: [{ lap: 1, time: '1:00.000' }],
      }],
    } as TimingConfig & { segments: Array<Record<string, string | number | object>> })

    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('only valid for source "manual"')
  })

  it('requires emailPath for daytonaEmail segments', async () => {
    const configPath = await writeTempConfig({
      driver: 'Alice',
      segments: [{
        source: 'daytonaEmail',
        mode: 'race',
        offset: '1:00.000',
      }],
    } as TimingConfig & { segments: Array<Record<string, string | number>> })

    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('missing "emailPath"')
  })

  it('loads overlay component config from config.json', async () => {
    const configPath = await writeTempConfig({
      driver: 'Alice',
      overlayComponents: { leaderboard: false },
      segments: [{
        source: 'manual',
        mode: 'practice',
        offset: '1:00.000',
        timingData: [{ lap: 1, time: '1:00.000' }],
      }],
    })

    const result = await loadTimingConfig(configPath, true)
    expect(result.overlayComponents).toEqual({ leaderboard: false })
  })
})

describe('validateManualTimingData', () => {
  it('accepts sequential laps starting at lap 0', () => {
    expect(validateManualTimingData([
      { lap: 0, time: '0:15.000' },
      { lap: 1, time: '1:00.000' },
      { lap: 2, time: '58.500' },
    ], 0)).toEqual([
      { lap: 0, time: '0:15.000' },
      { lap: 1, time: '1:00.000' },
      { lap: 2, time: '58.500' },
    ])
  })

  it('accepts sequential laps starting at lap 1', () => {
    expect(validateManualTimingData([
      { lap: 1, time: '1:00.000' },
      { lap: 2, time: '58.500' },
    ], 0)).toHaveLength(2)
  })

  it('rejects non-sequential manual timing data', () => {
    expect(() => validateManualTimingData([
      { lap: 0, time: '0:15.000' },
      { lap: 2, time: '58.500' },
    ], 0)).toThrow('sequential without gaps')
  })
})

describe('manual source', () => {
  it('treats lap 0 as a formation lap before the configured offset', async () => {
    const resolved = await resolveTimingSegments([
      {
        source: 'manual',
        mode: 'race',
        offset: '1:30.000',
        timingData: [
          { lap: 0, time: '0:15.000' },
          { lap: 1, time: '1:00.000' },
          { lap: 2, time: '58.500' },
        ],
      },
    ], 'Formation Driver')

    const { segments } = buildSessionSegments(resolved, [90])
    expect(segments[0].session.timestamps.map(ts => ({ lap: ts.lap.number, ytSeconds: ts.ytSeconds }))).toEqual([
      { lap: 0, ytSeconds: 75 },
      { lap: 1, ytSeconds: 90 },
      { lap: 2, ytSeconds: 150 },
    ])
  })
})

describe('teamsportEmail source', () => {
  it('parses drivers and lap times from a saved .eml', async () => {
    const resolved = await resolveTimingSegments([
      {
        source: 'teamsportEmail',
        mode: 'practice',
        offset: '0:30.000',
        emailPath: teamsportFixture,
      },
    ], 'Bob Example')

    expect(resolved[0].drivers).toHaveLength(3)
    expect(resolved[0].selectedDriver?.name).toBe('Bob Example')
    expect(resolved[0].selectedDriver?.laps.map(lap => lap.lapTime)).toEqual([62.5, 60.25])
    expect(resolved[0].capabilities.driverDiscovery).toBe(true)
  })
})

describe('mylapsSpeedhive source', () => {
  it('extracts the Speedhive session id from the session URL', () => {
    expect(extractSpeedhiveSessionId('https://speedhive.mylaps.com/sessions/11791523')).toBe('11791523')
  })

  it('resolves drivers and laps from the Speedhive API', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString()
      const json = daytonaResponseFor(url)
      if (json == null) {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const resolved = await resolveTimingSegments([
      {
        source: 'mylapsSpeedhive',
        mode: 'qualifying',
        offset: '0:45.000',
        url: 'https://speedhive.mylaps.com/sessions/11791523',
      },
    ], 'Callum')

    expect(fetchMock).toHaveBeenCalled()
    expect(resolved[0].drivers).toHaveLength(2)
    expect(resolved[0].selectedDriver).toMatchObject({ name: 'Callum Bendelow', kart: '153' })
    expect(resolved[0].selectedDriver?.laps.map(lap => lap.lapTime)).toEqual([51.163, 48.419, 47.901])
  })
})

describe('daytonaEmail source', () => {
  it('parses the newer 2025 Daytona email format', async () => {
    const resolved = await resolveTimingSegments([
      {
        source: 'daytonaEmail',
        mode: 'race',
        offset: '0:45.000',
        emailPath: daytona2025Fixture,
      },
    ], 'George Nick Gorzynski')

    expect(resolved[0].drivers.length).toBeGreaterThan(1)
    expect(resolved[0].selectedDriver).toMatchObject({
      name: 'George Nick Gorzynski',
      kart: '131',
    })
    expect(resolved[0].selectedDriver?.laps).toHaveLength(23)
    expect(resolved[0].selectedDriver?.laps[0]?.lapTime).toBe(55.064)
    expect(resolved[0].selectedDriver?.laps[22]?.lapTime).toBe(52.901)
    expect(resolved[0].capabilities.leaderboard).toBe(false)
  })

  it('parses the newer 2026 Daytona email format', async () => {
    const resolved = await resolveTimingSegments([
      {
        source: 'daytonaEmail',
        mode: 'race',
        offset: '0:45.000',
        emailPath: daytona2026Fixture,
      },
    ], 'George Nick Gorzynski')

    expect(resolved[0].drivers.length).toBeGreaterThan(1)
    expect(resolved[0].selectedDriver).toMatchObject({
      name: 'George Nick Gorzynski',
      kart: '57',
    })
    expect(resolved[0].selectedDriver?.laps).toHaveLength(20)
    expect(resolved[0].selectedDriver?.laps[0]?.lapTime).toBe(64.133)
    expect(resolved[0].selectedDriver?.laps[19]?.lapTime).toBe(62.574)
  })

  it('falls back to selected-driver-only session lap data for rendering', async () => {
    const resolved = await resolveTimingSegments([
      {
        source: 'daytonaEmail',
        mode: 'race',
        offset: '0:45.000',
        emailPath: daytona2025Fixture,
      },
    ], 'George Nick Gorzynski')

    const { segments } = buildSessionSegments(resolved, [45])
    expect(segments[0].sessionAllLaps).toHaveLength(1)
    expect(segments[0].leaderboardDrivers).toBeUndefined()
  })
})

describe('driver list helpers', () => {
  it('treats identical driver lists as shared', () => {
    const drivers = [driver('1', 'Alice'), driver('2', 'Bob')]
    expect(driverListsAreIdentical([
      { config: baseSegment('alphaTiming'), capabilities: baseCapabilities(), drivers },
      { config: baseSegment('mylapsSpeedhive'), capabilities: baseCapabilities(), drivers: [...drivers] },
    ])).toBe(true)
  })

  it('highlights matching drivers by partial case-insensitive query', () => {
    const matches = filterDriverHighlights(
      [driver('1', 'Alice Example'), driver('2', 'Bob Example')],
      'ali',
    )
    expect(matches).toEqual([driver('1', 'Alice Example')])
  })
})

function baseSegment(source: 'alphaTiming' | 'mylapsSpeedhive') {
  return { source, mode: 'practice', offset: '0:30.000', url: 'https://example.com' } as const
}

function baseCapabilities() {
  return {
    driverDiscovery: true,
    lapTimes: true,
    bestLap: true,
    lastLap: true,
    position: true,
    classificationPosition: true,
    leaderboard: true,
    gapToLeader: false,
    gapToKartAhead: false,
    gapToKartBehind: false,
    startingGrid: false,
    raceSnapshots: false,
  }
}

function driver(kart: string, name: string): DriverRow {
  return { kart, name, laps: [] }
}

async function writeTempConfig(config: TimingConfig | { driver?: string; segments: Array<Record<string, string | number | object>> }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'racedash-config-'))
  const filePath = join(dir, 'config.json')
  await writeFile(filePath, JSON.stringify(config, null, 2))
  return filePath
}

function daytonaResponseFor(url: string): object | null {
  if (url.endsWith('/sessions/11791523')) {
    return {
      id: 11791523,
      eventId: 3425858,
      name: 'DMAX Quali',
      type: 'qualify',
    }
  }

  if (url.endsWith('/sessions/11791523/classification')) {
    return {
      type: 'PracticeAndQualification',
      rows: [
        {
          name: 'Callum Bendelow',
          startNumber: '153',
          position: 1,
          positionInClass: 1,
          bestTime: '46.556',
          bestLap: 10,
          numberOfLaps: 3,
          gap: { lapsBehind: 0, timeDifference: '00.000' },
          difference: { lapsBehind: 0, timeDifference: '00.000' },
        },
        {
          name: 'Jack Redfern',
          startNumber: '131',
          position: 2,
          positionInClass: 2,
          bestTime: '46.640',
          bestLap: 3,
          numberOfLaps: 3,
          gap: { lapsBehind: 0, timeDifference: '00.084' },
          difference: { lapsBehind: 0, timeDifference: '00.084' },
        },
      ],
    }
  }

  if (url.endsWith('/sessions/11791523/lapdata/1/laps')) {
    return {
      lapDataInfo: {
        participantInfo: {
          name: 'Callum Bendelow',
          class: 'TNL DMAX Light',
          startNr: '153',
          startPos: 6,
          fieldFinishPos: 1,
          classFinishPos: 1,
        },
        lapCount: 3,
      },
      laps: [
        {
          lapNr: 1,
          timeOfDay: '2026-03-12T20:01:36.242',
          lapTime: '51.163',
          fieldComparison: { position: 6, leaderLap: 1, diff: null, gapAhead: null, gapBehind: null },
        },
        {
          lapNr: 2,
          timeOfDay: '2026-03-12T20:02:24.661',
          lapTime: '48.419',
          fieldComparison: { position: 6, leaderLap: 2, diff: null, gapAhead: null, gapBehind: null },
        },
        {
          lapNr: 3,
          timeOfDay: '2026-03-12T20:03:12.562',
          lapTime: '47.901',
          fieldComparison: { position: 5, leaderLap: 3, diff: null, gapAhead: null, gapBehind: null },
        },
      ],
    }
  }

  if (url.endsWith('/sessions/11791523/lapdata/2/laps')) {
    return {
      lapDataInfo: {
        participantInfo: {
          name: 'Jack Redfern',
          class: 'TNL DMAX Light',
          startNr: '131',
          startPos: 16,
          fieldFinishPos: 2,
          classFinishPos: 2,
        },
        lapCount: 3,
      },
      laps: [
        {
          lapNr: 1,
          timeOfDay: '2026-03-12T20:01:37.000',
          lapTime: '52.000',
          fieldComparison: { position: 7, leaderLap: 1, diff: null, gapAhead: null, gapBehind: null },
        },
        {
          lapNr: 2,
          timeOfDay: '2026-03-12T20:02:25.900',
          lapTime: '48.900',
          fieldComparison: { position: 7, leaderLap: 2, diff: null, gapAhead: null, gapBehind: null },
        },
        {
          lapNr: 3,
          timeOfDay: '2026-03-12T20:03:13.100',
          lapTime: '47.200',
          fieldComparison: { position: 2, leaderLap: 3, diff: null, gapAhead: null, gapBehind: null },
        },
      ],
    }
  }

  return null
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
