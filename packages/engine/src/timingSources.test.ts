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
  flattenTimestamps,
  formatDriverDisplay,
  getDriversForDisplay,
  loadTimingConfig,
  resolveDriversCommandSegments,
  resolvePositionOverrides,
  resolveTimingSegments,
  validateManualTimingData,
  validatePositionOverrideConfig,
  type TimingConfig,
} from './timingSources'

const teamsportFixture = join(__dirname, '__fixtures__', 'teamsport_sample.eml')
const teamsportRealFixture = join(__dirname, '__fixtures__', 'teamsport_real.eml')
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
      segments: [{ driver: 'Alice', mode: 'practice', offset: '1:00.000', url: 'https://example.com' }],
    })

    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('valid "source"')
  })

  it('rejects timingData on non-manual sources', async () => {
    const configPath = await writeTempConfig({
      segments: [
        {
          driver: 'Alice',
          source: 'alphaTiming',
          mode: 'practice',
          offset: '1:00.000',
          url: 'https://results.alphatiming.co.uk/session/1',
          timingData: [{ lap: 1, time: '1:00.000' }],
        },
      ],
    } as TimingConfig & { segments: Array<Record<string, string | number | object>> })

    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('only valid for source "manual"')
  })

  it('requires emailPath for daytonaEmail segments', async () => {
    const configPath = await writeTempConfig({
      segments: [
        {
          driver: 'Alice',
          source: 'daytonaEmail',
          mode: 'race',
          offset: '1:00.000',
        },
      ],
    } as TimingConfig & { segments: Array<Record<string, string | number>> })

    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('missing "emailPath"')
  })

  it('loads overlay component config from config.json', async () => {
    const configPath = await writeTempConfig({
      overlayComponents: { leaderboard: false },
      segments: [
        {
          driver: 'Alice',
          source: 'manual',
          mode: 'practice',
          offset: '1:00.000',
          timingData: [{ lap: 1, time: '1:00.000' }],
        },
      ],
    })

    const result = await loadTimingConfig(configPath, true)
    expect(result.overlayComponents).toEqual({ leaderboard: false })
  })
})

describe('cached source validation', () => {
  const baseCachedSegment = {
    driver: 'Alice',
    source: 'cached',
    mode: 'race',
    offset: '1:00.000',
    originalSource: 'alphaTiming',
    drivers: [{ kart: '42', name: 'Alice', laps: [] }],
    capabilities: {
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: true,
      classificationPosition: true,
      leaderboard: true,
      gapToLeader: true,
      gapToKartAhead: true,
      gapToKartBehind: false,
      startingGrid: true,
      raceSnapshots: true,
    },
    startingGrid: [{ kart: '42', position: 1 }],
    replayData: [
      [
        {
          driverId: 1,
          position: 1,
          kart: '42',
          name: 'Alice',
          lapsCompleted: 1,
          totalSeconds: 60.0,
          gapToLeader: '',
          intervalToAhead: '',
        },
      ],
    ],
  }

  it('accepts a valid cached segment', async () => {
    const configPath = await writeTempConfig({
      segments: [baseCachedSegment],
    })
    const result = await loadTimingConfig(configPath, true)
    expect(result.segments[0].source).toBe('cached')
  })

  it('rejects cached segment missing drivers', async () => {
    const { drivers: _, ...noDrivers } = baseCachedSegment
    const configPath = await writeTempConfig({
      segments: [noDrivers],
    })
    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('drivers must be an array')
  })

  it('rejects cached segment missing capabilities', async () => {
    const { capabilities: _, ...noCaps } = baseCachedSegment
    const configPath = await writeTempConfig({
      segments: [noCaps],
    })
    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('capabilities is required')
  })

  it('rejects cached segment missing originalSource', async () => {
    const { originalSource: _, ...noOriginal } = baseCachedSegment
    const configPath = await writeTempConfig({
      segments: [noOriginal],
    })
    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('originalSource must be one of')
  })

  it('rejects cached segment with invalid originalSource', async () => {
    const configPath = await writeTempConfig({
      segments: [{ ...baseCachedSegment, originalSource: 'invalidSource' }],
    })
    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('originalSource must be one of')
  })
})

describe('resolveCachedSegment', () => {
  it('returns cached data directly without network calls', async () => {
    const drivers = [
      { kart: '42', name: 'Alice', laps: [{ number: 1, lapTime: 60.123, cumulative: 60.123 }] },
      { kart: '7', name: 'Bob', laps: [{ number: 1, lapTime: 61.0, cumulative: 61.0 }] },
    ]
    const capabilities = {
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: true,
      classificationPosition: true,
      leaderboard: true,
      gapToLeader: true,
      gapToKartAhead: true,
      gapToKartBehind: false,
      startingGrid: true,
      raceSnapshots: true,
    }
    const startingGrid = [
      { kart: '42', position: 1 },
      { kart: '7', position: 2 },
    ]
    const replayData: unknown[][] = [
      [
        {
          driverId: 1,
          position: 1,
          kart: '42',
          name: 'Alice',
          lapsCompleted: 1,
          totalSeconds: 60.123,
          gapToLeader: '',
          intervalToAhead: '',
        },
      ],
    ]

    const configPath = await writeTempConfig({
      segments: [
        {
          driver: 'Alice',
          source: 'cached',
          mode: 'race',
          offset: '1:00.000',
          originalSource: 'alphaTiming',
          drivers,
          capabilities,
          startingGrid,
          replayData,
        },
      ],
    })
    const loaded = await loadTimingConfig(configPath, true)
    const resolved = await resolveTimingSegments(loaded.segments)

    expect(resolved[0].drivers).toEqual(drivers)
    expect(resolved[0].capabilities).toEqual(capabilities)
    expect(resolved[0].startingGrid).toEqual(startingGrid)
    expect(resolved[0].replayData).toEqual(replayData)
  })

  it('matches selectedDriver from cached drivers by query', async () => {
    const drivers = [
      { kart: '42', name: 'Alice Example', laps: [] },
      { kart: '7', name: 'Bob Example', laps: [] },
    ]
    const capabilities = {
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: false,
      classificationPosition: false,
      leaderboard: false,
      gapToLeader: false,
      gapToKartAhead: false,
      gapToKartBehind: false,
      startingGrid: false,
      raceSnapshots: false,
    }

    const configPath = await writeTempConfig({
      segments: [
        {
          driver: 'Alice',
          source: 'cached',
          mode: 'practice',
          offset: '0:30.000',
          originalSource: 'manual',
          drivers,
          capabilities,
        },
      ],
    })
    const loaded = await loadTimingConfig(configPath, true)
    const resolved = await resolveTimingSegments(loaded.segments)

    expect(resolved[0].selectedDriver).toMatchObject({ name: 'Alice Example', kart: '42' })
  })

  it('round-trips through JSON serialization without data loss', async () => {
    const replayData: unknown[][] = [
      [
        {
          driverId: 1,
          position: 1,
          kart: '42',
          name: 'Alice',
          lapsCompleted: 1,
          totalSeconds: 60.123,
          gapToLeader: '',
          intervalToAhead: '',
        },
        {
          driverId: 2,
          position: 2,
          kart: '7',
          name: 'Bob',
          lapsCompleted: 1,
          totalSeconds: 61.0,
          gapToLeader: '0.877',
          intervalToAhead: '0.877',
        },
      ],
    ]

    const segment = {
      driver: 'Alice',
      source: 'cached',
      mode: 'race',
      offset: '1:00.000',
      originalSource: 'alphaTiming',
      drivers: [{ kart: '42', name: 'Alice', laps: [{ number: 1, lapTime: 60.123, cumulative: 60.123 }] }],
      capabilities: {
        driverDiscovery: true,
        lapTimes: true,
        bestLap: true,
        lastLap: true,
        position: true,
        classificationPosition: true,
        leaderboard: true,
        gapToLeader: true,
        gapToKartAhead: true,
        gapToKartBehind: false,
        startingGrid: false,
        raceSnapshots: true,
      },
      replayData,
    }

    const configPath = await writeTempConfig({
      segments: [segment],
    })

    const loaded = await loadTimingConfig(configPath, true)
    const resolved = await resolveTimingSegments(loaded.segments)

    expect(resolved[0].replayData).toBeDefined()
    expect((resolved[0].replayData as unknown[][])[0][0]).toMatchObject({ totalSeconds: 60.123 })
    expect((resolved[0].replayData as unknown[][])[0][1]).toMatchObject({ totalSeconds: 61.0, gapToLeader: '0.877' })
  })
})

describe('validateManualTimingData', () => {
  it('accepts sequential laps starting at lap 0', () => {
    expect(
      validateManualTimingData(
        [
          { lap: 0, time: '0:15.000' },
          { lap: 1, time: '1:00.000' },
          { lap: 2, time: '58.500' },
        ],
        0,
      ),
    ).toEqual([
      { lap: 0, time: '0:15.000' },
      { lap: 1, time: '1:00.000' },
      { lap: 2, time: '58.500' },
    ])
  })

  it('accepts sequential laps starting at lap 1', () => {
    expect(
      validateManualTimingData(
        [
          { lap: 1, time: '1:00.000' },
          { lap: 2, time: '58.500' },
        ],
        0,
      ),
    ).toHaveLength(2)
  })

  it('rejects non-sequential manual timing data', () => {
    expect(() =>
      validateManualTimingData(
        [
          { lap: 0, time: '0:15.000' },
          { lap: 2, time: '58.500' },
        ],
        0,
      ),
    ).toThrow('sequential without gaps')
  })
})

describe('manual source', () => {
  it('treats lap 0 as a formation lap before the configured offset', async () => {
    const resolved = await resolveTimingSegments([
      {
        driver: 'Formation Driver',
        source: 'manual',
        mode: 'race',
        offset: '1:30.000',
        timingData: [
          { lap: 0, time: '0:15.000' },
          { lap: 1, time: '1:00.000' },
          { lap: 2, time: '58.500' },
        ],
      },
    ])

    const { segments } = buildSessionSegments(resolved, [90])
    expect(segments[0].session.timestamps.map((ts) => ({ lap: ts.lap.number, ytSeconds: ts.ytSeconds }))).toEqual([
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
        driver: 'Bob Example',
        source: 'teamsportEmail',
        mode: 'practice',
        offset: '0:30.000',
        emailPath: teamsportFixture,
      },
    ])

    expect(resolved[0].drivers).toHaveLength(3)
    expect(resolved[0].selectedDriver?.name).toBe('Bob Example')
    expect(resolved[0].selectedDriver?.laps.map((lap) => lap.lapTime)).toEqual([62.5, 60.25])
    expect(resolved[0].capabilities.driverDiscovery).toBe(true)
  })

  it('parses a real multi-table TeamSport email (sanitised)', async () => {
    const resolved = await resolveTimingSegments([
      {
        driver: 'Jamie Chen',
        source: 'teamsportEmail',
        mode: 'practice',
        offset: '1:00.000',
        emailPath: teamsportRealFixture,
      },
    ])

    expect(resolved[0].drivers).toHaveLength(16)
    expect(resolved[0].selectedDriver?.name).toBe('Jamie Chen')
    expect(resolved[0].selectedDriver?.laps).toHaveLength(13)

    // Verify first lap (raw: 1:03.476 → 63.476s) and best lap (39.484s)
    expect(resolved[0].selectedDriver?.laps[0].lapTime).toBeCloseTo(63.476, 2)
    const bestLap = Math.min(...resolved[0].selectedDriver!.laps.map((l) => l.lapTime))
    expect(bestLap).toBeCloseTo(39.484, 2)
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
        driver: 'Callum',
        source: 'mylapsSpeedhive',
        mode: 'qualifying',
        offset: '0:45.000',
        url: 'https://speedhive.mylaps.com/sessions/11791523',
      },
    ])

    expect(fetchMock).toHaveBeenCalled()
    expect(resolved[0].drivers).toHaveLength(2)
    expect(resolved[0].selectedDriver).toMatchObject({ name: 'Callum Bendelow', kart: '153' })
    expect(resolved[0].selectedDriver?.laps.map((lap) => lap.lapTime)).toEqual([51.163, 48.419, 47.901])
  })
})

describe('daytonaEmail source', () => {
  it('parses the newer 2025 Daytona email format', async () => {
    const resolved = await resolveTimingSegments([
      {
        driver: 'Alex James Mitchell',
        source: 'daytonaEmail',
        mode: 'race',
        offset: '0:45.000',
        emailPath: daytona2025Fixture,
      },
    ])

    expect(resolved[0].drivers.length).toBeGreaterThan(1)
    expect(resolved[0].selectedDriver).toMatchObject({
      name: 'Alex James Mitchell',
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
        driver: 'Alex James Mitchell',
        source: 'daytonaEmail',
        mode: 'race',
        offset: '0:45.000',
        emailPath: daytona2026Fixture,
      },
    ])

    expect(resolved[0].drivers.length).toBeGreaterThan(1)
    expect(resolved[0].selectedDriver).toMatchObject({
      name: 'Alex James Mitchell',
      kart: '57',
    })
    expect(resolved[0].selectedDriver?.laps).toHaveLength(20)
    expect(resolved[0].selectedDriver?.laps[0]?.lapTime).toBe(64.133)
    expect(resolved[0].selectedDriver?.laps[19]?.lapTime).toBe(62.574)
  })

  it('falls back to selected-driver-only session lap data for rendering', async () => {
    const resolved = await resolveTimingSegments([
      {
        driver: 'Alex James Mitchell',
        source: 'daytonaEmail',
        mode: 'race',
        offset: '0:45.000',
        emailPath: daytona2025Fixture,
      },
    ])

    const { segments } = buildSessionSegments(resolved, [45])
    expect(segments[0].sessionAllLaps).toHaveLength(1)
    expect(segments[0].leaderboardDrivers).toBeUndefined()
  })
})

describe('driver list helpers', () => {
  it('treats identical driver lists as shared', () => {
    const drivers = [driver('1', 'Alice'), driver('2', 'Bob')]
    expect(
      driverListsAreIdentical([
        { config: baseSegment('alphaTiming'), capabilities: baseCapabilities(), drivers },
        { config: baseSegment('mylapsSpeedhive'), capabilities: baseCapabilities(), drivers: [...drivers] },
      ]),
    ).toBe(true)
  })

  it('highlights matching drivers by partial case-insensitive query', () => {
    const matches = filterDriverHighlights([driver('1', 'Alice Example'), driver('2', 'Bob Example')], 'ali')
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

async function writeTempConfig(
  config: TimingConfig | { segments: Array<Record<string, string | number | object>> },
): Promise<string> {
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
    const replayData: ReplayLapData = [[makeEntry(1, '1', 0)], [makeEntry(1, '1', 69.707), makeEntry(2, '2', 70.207)]]
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
    const replayData: ReplayLapData = [[makeEntry(1, '1', 0)], [makeEntry(1, '1', null), makeEntry(2, '2', null)]]
    const result = buildRaceLapSnapshots(replayData, 0)
    expect(result).toEqual([])
  })

  it('mapped RaceLapEntry omits totalSeconds and driverId', () => {
    const replayData: ReplayLapData = [[makeEntry(1, '1', 0)], [makeEntry(1, '1', 60.0), makeEntry(2, '2', 60.5)]]
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
    expect(() => validatePositionOverrideConfig([{ timestamp: '6:02.345', position: 6 }], 'qualifying', 0)).toThrow(
      'only valid for race segments',
    )
  })

  it('rejects invalid positions', () => {
    expect(() => validatePositionOverrideConfig([{ timestamp: '6:02.345', position: 0 }], 'race', 0)).toThrow(
      'position must be an integer >= 1',
    )
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
    expect(() => resolvePositionOverrides([{ timestamp: '4:59.999', position: 6 }], 300, 0)).toThrow(
      'timestamp must be >= the segment offset',
    )
  })
})

describe('cached source property and characterisation tests', () => {
  describe('round-trip equivalence', () => {
    it('preserves all fields through cache → serialize → deserialize → resolve', async () => {
      // Build a rich dataset: 3 drivers, 3 laps each, race mode
      // with startingGrid and replayData (2 lap snapshots)
      const drivers = [
        {
          kart: '42',
          name: 'Alice',
          laps: [
            { number: 1, lapTime: 62.345, cumulative: 62.345 },
            { number: 2, lapTime: 58.901, cumulative: 121.246 },
            { number: 3, lapTime: 59.1, cumulative: 180.346 },
          ],
        },
        {
          kart: '7',
          name: 'Bob',
          laps: [
            { number: 1, lapTime: 63.0, cumulative: 63.0 },
            { number: 2, lapTime: 59.5, cumulative: 122.5 },
            { number: 3, lapTime: 60.2, cumulative: 182.7 },
          ],
        },
        {
          kart: '13',
          name: 'Charlie',
          laps: [
            { number: 1, lapTime: 64.1, cumulative: 64.1 },
            { number: 2, lapTime: 60.0, cumulative: 124.1 },
            { number: 3, lapTime: 58.5, cumulative: 182.6 },
          ],
        },
      ]
      const capabilities = {
        driverDiscovery: true,
        lapTimes: true,
        bestLap: true,
        lastLap: true,
        position: true,
        classificationPosition: true,
        leaderboard: true,
        gapToLeader: true,
        gapToKartAhead: true,
        gapToKartBehind: false,
        startingGrid: true,
        raceSnapshots: true,
      }
      const startingGrid = [
        { position: 1, kart: '42', name: 'Alice' },
        { position: 2, kart: '7', name: 'Bob' },
        { position: 3, kart: '13', name: 'Charlie' },
      ]
      // replayData: index 0 = pre-race, index 1 = after lap 1, index 2 = after lap 2
      const replayData = [
        // Pre-race (index 0) — positions from grid
        [
          {
            driverId: 1,
            position: 1,
            kart: '42',
            name: 'Alice',
            lapsCompleted: 0,
            totalSeconds: null,
            gapToLeader: '',
            intervalToAhead: '',
          },
          {
            driverId: 2,
            position: 2,
            kart: '7',
            name: 'Bob',
            lapsCompleted: 0,
            totalSeconds: null,
            gapToLeader: '',
            intervalToAhead: '',
          },
          {
            driverId: 3,
            position: 3,
            kart: '13',
            name: 'Charlie',
            lapsCompleted: 0,
            totalSeconds: null,
            gapToLeader: '',
            intervalToAhead: '',
          },
        ],
        // After leader lap 1
        [
          {
            driverId: 1,
            position: 1,
            kart: '42',
            name: 'Alice',
            lapsCompleted: 1,
            totalSeconds: 62.345,
            gapToLeader: '',
            intervalToAhead: '',
          },
          {
            driverId: 2,
            position: 2,
            kart: '7',
            name: 'Bob',
            lapsCompleted: 1,
            totalSeconds: 63.0,
            gapToLeader: '0.655',
            intervalToAhead: '0.655',
          },
          {
            driverId: 3,
            position: 3,
            kart: '13',
            name: 'Charlie',
            lapsCompleted: 1,
            totalSeconds: 64.1,
            gapToLeader: '1.755',
            intervalToAhead: '1.100',
          },
        ],
        // After leader lap 2
        [
          {
            driverId: 1,
            position: 1,
            kart: '42',
            name: 'Alice',
            lapsCompleted: 2,
            totalSeconds: 121.246,
            gapToLeader: '',
            intervalToAhead: '',
          },
          {
            driverId: 2,
            position: 2,
            kart: '7',
            name: 'Bob',
            lapsCompleted: 2,
            totalSeconds: 122.5,
            gapToLeader: '1.254',
            intervalToAhead: '1.254',
          },
          {
            driverId: 3,
            position: 3,
            kart: '13',
            name: 'Charlie',
            lapsCompleted: 2,
            totalSeconds: 124.1,
            gapToLeader: '2.854',
            intervalToAhead: '1.600',
          },
        ],
      ]

      const configPath = await writeTempConfig({
        segments: [
          {
            driver: 'Alice',
            source: 'cached',
            mode: 'race',
            offset: '0:00.000',
            originalSource: 'alphaTiming',
            drivers,
            capabilities,
            startingGrid,
            replayData,
          },
        ],
      })

      const loaded = await loadTimingConfig(configPath, true)
      const resolved = await resolveTimingSegments(loaded.segments)
      const seg = resolved[0]

      // Every field must survive the round-trip
      expect(seg.drivers).toEqual(drivers)
      expect(seg.selectedDriver?.name).toBe('Alice')
      expect(seg.selectedDriver?.laps).toEqual(drivers[0].laps)
      expect(seg.capabilities).toEqual(capabilities)
      expect(seg.startingGrid).toEqual(startingGrid)
      expect(seg.replayData).toEqual(replayData)
      // Verify each driver's laps individually
      for (let d = 0; d < drivers.length; d++) {
        expect(seg.drivers[d].laps).toHaveLength(drivers[d].laps.length)
        for (let l = 0; l < drivers[d].laps.length; l++) {
          expect(seg.drivers[d].laps[l].lapTime).toBe(drivers[d].laps[l].lapTime)
          expect(seg.drivers[d].laps[l].cumulative).toBe(drivers[d].laps[l].cumulative)
        }
      }
    })
  })

  describe('numeric precision preservation', () => {
    it('preserves floating-point precision through JSON round-trip', async () => {
      // Edge cases: very small differences, repeating decimals, accumulated sums
      const edgeCaseLaps = [
        { number: 1, lapTime: 0.001, cumulative: 0.001 }, // very small
        { number: 2, lapTime: 59.999, cumulative: 60.0 }, // near-integer sum
        { number: 3, lapTime: 0.1 + 0.2, cumulative: 60.0 + 0.3 }, // IEEE 754 classic
        { number: 4, lapTime: 123.456789, cumulative: 183.756789 }, // many decimals
      ]

      const configPath = await writeTempConfig({
        segments: [
          {
            driver: 'Precision Test',
            source: 'cached',
            mode: 'practice',
            offset: '0:00.000',
            originalSource: 'alphaTiming',
            drivers: [{ kart: '1', name: 'Precision Test', laps: edgeCaseLaps }],
            capabilities: {
              driverDiscovery: false,
              lapTimes: true,
              bestLap: true,
              lastLap: true,
              position: false,
              classificationPosition: false,
              leaderboard: false,
              gapToLeader: false,
              gapToKartAhead: false,
              gapToKartBehind: false,
              startingGrid: false,
              raceSnapshots: false,
            },
          },
        ],
      })

      const loaded = await loadTimingConfig(configPath, true)
      const resolved = await resolveTimingSegments(loaded.segments)
      const laps = resolved[0].selectedDriver!.laps

      for (let i = 0; i < edgeCaseLaps.length; i++) {
        expect(laps[i].lapTime).toBe(edgeCaseLaps[i].lapTime)
        expect(laps[i].cumulative).toBe(edgeCaseLaps[i].cumulative)
      }
    })
  })

  describe('driver matching equivalence', () => {
    it('finds the same driver by partial query on cached data', async () => {
      const drivers = [
        { kart: '42', name: 'Alex Mitchell', laps: [{ number: 1, lapTime: 60.0, cumulative: 60.0 }] },
        { kart: '7', name: 'Alex Morgan', laps: [{ number: 1, lapTime: 61.0, cumulative: 61.0 }] },
        { kart: '13', name: 'Alice Smith', laps: [{ number: 1, lapTime: 62.0, cumulative: 62.0 }] },
      ]

      const configPath = await writeTempConfig({
        segments: [
          {
            driver: 'Alice',
            source: 'cached',
            mode: 'race',
            offset: '0:00.000',
            originalSource: 'alphaTiming',
            drivers,
            capabilities: {
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
            },
          },
        ],
      })

      const loaded = await loadTimingConfig(configPath, true)

      // Unique match
      const resolved1 = await resolveTimingSegments(loaded.segments)
      expect(resolved1[0].selectedDriver?.name).toBe('Alice Smith')
      expect(resolved1[0].selectedDriver?.kart).toBe('13')

      // Ambiguous match should throw (same behavior as all other sources)
      await expect(resolveTimingSegments(loaded.segments.map((s) => ({ ...s, driver: 'Alex' })))).rejects.toThrow(
        /ambiguous/i,
      )

      // No match should throw
      await expect(
        resolveTimingSegments(loaded.segments.map((s) => ({ ...s, driver: 'Nonexistent' }))),
      ).rejects.toThrow(/no driver/i)
    })
  })

  describe('no nested caching', () => {
    it('cached segments resolve with source still set to cached', async () => {
      const configPath = await writeTempConfig({
        segments: [
          {
            driver: 'Test',
            source: 'cached',
            mode: 'race',
            offset: '0:00.000',
            originalSource: 'alphaTiming',
            drivers: [{ kart: '1', name: 'Test', laps: [{ number: 1, lapTime: 60, cumulative: 60 }] }],
            capabilities: {
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
            },
          },
        ],
      })

      const loaded = await loadTimingConfig(configPath, true)
      const resolved = await resolveTimingSegments(loaded.segments)

      // The resolved config should still be 'cached', not double-wrapped
      expect(resolved[0].config.source).toBe('cached')
      // And originalSource should be preserved (not 'cached')
      expect((resolved[0].config as any).originalSource).toBe('alphaTiming')
    })

    it('rejects originalSource set to cached at validation level', async () => {
      const configPath = await writeTempConfig({
        segments: [
          {
            driver: 'Test',
            source: 'cached',
            mode: 'race',
            offset: '0:00.000',
            originalSource: 'cached', // THIS SHOULD BE REJECTED
            drivers: [],
            capabilities: {
              driverDiscovery: false,
              lapTimes: true,
              bestLap: true,
              lastLap: true,
              position: false,
              classificationPosition: false,
              leaderboard: false,
              gapToLeader: false,
              gapToKartAhead: false,
              gapToKartBehind: false,
              startingGrid: false,
              raceSnapshots: false,
            },
          },
        ],
      })

      await expect(loadTimingConfig(configPath, true)).rejects.toThrow(/originalSource/)
    })
  })

  describe('full pipeline: cached → buildSessionSegments', () => {
    it('produces correct SessionSegment with leaderboard, grid position, and race snapshots', async () => {
      const drivers = [
        {
          kart: '42',
          name: 'Alice',
          laps: [
            { number: 1, lapTime: 62.0, cumulative: 62.0 },
            { number: 2, lapTime: 58.0, cumulative: 120.0 },
          ],
        },
        {
          kart: '7',
          name: 'Bob',
          laps: [
            { number: 1, lapTime: 63.0, cumulative: 63.0 },
            { number: 2, lapTime: 59.0, cumulative: 122.0 },
          ],
        },
      ]
      const startingGrid = [
        { position: 1, kart: '42', name: 'Alice' },
        { position: 2, kart: '7', name: 'Bob' },
      ]
      const replayData = [
        // Pre-race
        [
          {
            driverId: 1,
            position: 1,
            kart: '42',
            name: 'Alice',
            lapsCompleted: 0,
            totalSeconds: null,
            gapToLeader: '',
            intervalToAhead: '',
          },
          {
            driverId: 2,
            position: 2,
            kart: '7',
            name: 'Bob',
            lapsCompleted: 0,
            totalSeconds: null,
            gapToLeader: '',
            intervalToAhead: '',
          },
        ],
        // After lap 1
        [
          {
            driverId: 1,
            position: 1,
            kart: '42',
            name: 'Alice',
            lapsCompleted: 1,
            totalSeconds: 62.0,
            gapToLeader: '',
            intervalToAhead: '',
          },
          {
            driverId: 2,
            position: 2,
            kart: '7',
            name: 'Bob',
            lapsCompleted: 1,
            totalSeconds: 63.0,
            gapToLeader: '1.000',
            intervalToAhead: '1.000',
          },
        ],
        // After lap 2
        [
          {
            driverId: 1,
            position: 1,
            kart: '42',
            name: 'Alice',
            lapsCompleted: 2,
            totalSeconds: 120.0,
            gapToLeader: '',
            intervalToAhead: '',
          },
          {
            driverId: 2,
            position: 2,
            kart: '7',
            name: 'Bob',
            lapsCompleted: 2,
            totalSeconds: 122.0,
            gapToLeader: '2.000',
            intervalToAhead: '2.000',
          },
        ],
      ]
      const capabilities = {
        driverDiscovery: true,
        lapTimes: true,
        bestLap: true,
        lastLap: true,
        position: true,
        classificationPosition: true,
        leaderboard: true,
        gapToLeader: true,
        gapToKartAhead: true,
        gapToKartBehind: false,
        startingGrid: true,
        raceSnapshots: true,
      }

      const configPath = await writeTempConfig({
        segments: [
          {
            driver: 'Alice',
            source: 'cached',
            mode: 'race',
            offset: '10:00.000',
            originalSource: 'alphaTiming',
            drivers,
            capabilities,
            startingGrid,
            replayData,
          },
        ],
      })

      const loaded = await loadTimingConfig(configPath, true)
      const resolved = await resolveTimingSegments(loaded.segments)
      const offset = 600 // 10:00.000 in seconds
      const { segments, startingGridPosition } = buildSessionSegments(resolved, [offset])

      // --- Session data ---
      expect(segments).toHaveLength(1)
      const seg = segments[0]
      expect(seg.mode).toBe('race')
      expect(seg.session.driver).toEqual({ kart: '42', name: 'Alice' })
      expect(seg.session.laps).toHaveLength(2)
      expect(seg.label).toBe(undefined) // no label set

      // --- Lap timestamps offset by 600s ---
      // ytSeconds = cumulative - lapTime + offset
      expect(seg.session.timestamps).toHaveLength(2)
      expect(seg.session.timestamps[0].ytSeconds).toBe(offset + 62.0 - 62.0) // lap 1 start
      expect(seg.session.timestamps[1].ytSeconds).toBe(offset + 120.0 - 58.0) // lap 2 start

      // --- Starting grid position ---
      expect(startingGridPosition).toBe(1) // Alice is P1

      // --- Leaderboard drivers (both drivers since leaderboard capability is true) ---
      expect(seg.leaderboardDrivers).toBeDefined()
      expect(seg.leaderboardDrivers).toHaveLength(2)
      expect(seg.leaderboardDrivers![0].kart).toBe('42')
      expect(seg.leaderboardDrivers![1].kart).toBe('7')

      // --- Race lap snapshots from replay data ---
      expect(seg.raceLapSnapshots).toBeDefined()
      expect(seg.raceLapSnapshots).toHaveLength(2) // 2 laps (index 0 = pre-race is skipped)

      // Snapshot after lap 1
      const snap1 = seg.raceLapSnapshots![0]
      expect(snap1.leaderLap).toBe(1)
      expect(snap1.videoTimestamp).toBe(offset + 62.0) // P1 totalSeconds + offset
      expect(snap1.entries).toHaveLength(2)
      expect(snap1.entries[0].position).toBe(1)
      expect(snap1.entries[0].kart).toBe('42')
      expect(snap1.entries[1].position).toBe(2)
      expect(snap1.entries[1].gapToLeader).toBe('1.000')

      // Snapshot after lap 2
      const snap2 = seg.raceLapSnapshots![1]
      expect(snap2.leaderLap).toBe(2)
      expect(snap2.videoTimestamp).toBe(offset + 120.0)
      expect(snap2.entries[1].gapToLeader).toBe('2.000')
    })

    it('handles practice mode without replayData or startingGrid', async () => {
      const drivers = [
        { kart: '42', name: 'Alice', laps: [{ number: 1, lapTime: 62.0, cumulative: 62.0 }] },
        { kart: '7', name: 'Bob', laps: [{ number: 1, lapTime: 63.0, cumulative: 63.0 }] },
      ]

      const configPath = await writeTempConfig({
        segments: [
          {
            driver: 'Alice',
            source: 'cached',
            mode: 'practice',
            offset: '0:00.000',
            originalSource: 'alphaTiming',
            drivers,
            capabilities: {
              driverDiscovery: true,
              lapTimes: true,
              bestLap: true,
              lastLap: true,
              position: false,
              classificationPosition: false,
              leaderboard: true,
              gapToLeader: false,
              gapToKartAhead: false,
              gapToKartBehind: false,
              startingGrid: false,
              raceSnapshots: false,
            },
            // No startingGrid, no replayData
          },
        ],
      })

      const loaded = await loadTimingConfig(configPath, true)
      const resolved = await resolveTimingSegments(loaded.segments)
      const { segments, startingGridPosition } = buildSessionSegments(resolved, [0])

      const seg = segments[0]
      expect(seg.mode).toBe('practice')
      expect(seg.session.driver.name).toBe('Alice')
      expect(seg.raceLapSnapshots).toBeUndefined()
      expect(startingGridPosition).toBeUndefined()
      // Leaderboard still populated (capability is true, drivers have laps)
      expect(seg.leaderboardDrivers).toBeDefined()
      expect(seg.leaderboardDrivers).toHaveLength(2)
    })
  })
})

describe('flattenTimestamps', () => {
  it('flattens and sorts timestamps from multiple segments', () => {
    const segments = [
      {
        session: {
          timestamps: [
            { ytSeconds: 30, label: 'L1' },
            { ytSeconds: 90, label: 'L2' },
          ],
        },
      },
      {
        session: {
          timestamps: [
            { ytSeconds: 10, label: 'L0' },
            { ytSeconds: 60, label: 'L1' },
          ],
        },
      },
    ] as any
    const result = flattenTimestamps(segments)
    expect(result.map((t: any) => t.ytSeconds)).toEqual([10, 30, 60, 90])
  })
})

describe('getDriversForDisplay', () => {
  it('returns full driver list when driverDiscovery is true', () => {
    const drivers = [{ kart: '1', name: 'Alice', laps: [] }]
    const result = getDriversForDisplay({
      drivers,
      selectedDriver: drivers[0],
      capabilities: { driverDiscovery: true } as any,
    })
    expect(result).toEqual(drivers)
  })

  it('returns selectedDriver only when no driverDiscovery', () => {
    const driver = { kart: '1', name: 'Alice', laps: [] }
    const result = getDriversForDisplay({
      drivers: [],
      selectedDriver: driver,
      capabilities: { driverDiscovery: false } as any,
    })
    expect(result).toEqual([driver])
  })

  it('returns empty array when no driverDiscovery and no selectedDriver', () => {
    const result = getDriversForDisplay({
      drivers: [],
      selectedDriver: undefined,
      capabilities: { driverDiscovery: false } as any,
    })
    expect(result).toEqual([])
  })
})

describe('formatDriverDisplay', () => {
  it('formats driver with kart number', () => {
    expect(formatDriverDisplay({ kart: '7', name: 'Alice', laps: [] })).toBe('[  7] Alice')
  })

  it('formats driver without kart number', () => {
    expect(formatDriverDisplay({ kart: '', name: 'Alice', laps: [] })).toBe('Alice')
  })
})

describe('driverListsAreIdentical (extended)', () => {
  it('returns true for single segment', () => {
    expect(driverListsAreIdentical([{ drivers: [{ kart: '1', name: 'A', laps: [] }] } as any])).toBe(true)
  })

  it('returns false when driver lists differ', () => {
    const seg1 = {
      drivers: [
        { kart: '1', name: 'A', laps: [] },
        { kart: '2', name: 'B', laps: [] },
      ],
    } as any
    const seg2 = {
      drivers: [
        { kart: '1', name: 'A', laps: [] },
        { kart: '3', name: 'C', laps: [] },
      ],
    } as any
    expect(driverListsAreIdentical([seg1, seg2])).toBe(false)
  })

  it('returns true when driver lists are identical', () => {
    const drivers = [
      { kart: '1', name: 'A', laps: [] },
      { kart: '2', name: 'B', laps: [] },
    ]
    const seg1 = { drivers } as any
    const seg2 = { drivers } as any
    expect(driverListsAreIdentical([seg1, seg2])).toBe(true)
  })
})

describe('loadTimingConfig edge cases', () => {
  it('rejects empty segments array', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(configPath, JSON.stringify({ segments: [] }))
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('non-empty "segments"')
  })

  it('rejects config without segments key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(configPath, JSON.stringify({}))
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('non-empty "segments"')
  })

  it('requires driver when requireDriver is true', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [{ source: 'alphaTiming', mode: 'race', offset: '0:00', url: 'https://example.com' }],
      }),
    )
    await expect(loadTimingConfig(configPath, true)).rejects.toThrow('driver is required')
  })

  it('rejects url on teamsportEmail source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'teamsportEmail',
            mode: 'practice',
            offset: '0:00',
            emailPath: 'test.eml',
            url: 'https://bad.com',
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('url is not valid for source "teamsportEmail"')
  })

  it('rejects timingData on teamsportEmail source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'teamsportEmail',
            mode: 'practice',
            offset: '0:00',
            emailPath: 'test.eml',
            timingData: [{ lap: 1, time: '1:00' }],
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('timingData is only valid for source "manual"')
  })

  it('rejects emailPath on alphaTiming source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'alphaTiming',
            mode: 'race',
            offset: '0:00',
            url: 'https://example.com',
            emailPath: 'test.eml',
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('emailPath is not valid for source "alphaTiming"')
  })

  it('parses daytonaEmail segment config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'daytonaEmail',
            mode: 'practice',
            offset: '0:00',
            driver: 'Test',
            emailPath: 'test.eml',
          },
        ],
      }),
    )
    const config = await loadTimingConfig(configPath, true)
    expect(config.segments[0].source).toBe('daytonaEmail')
  })

  it('rejects url on daytonaEmail source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'daytonaEmail',
            mode: 'practice',
            offset: '0:00',
            emailPath: 'test.eml',
            url: 'https://bad.com',
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('url is not valid for source "daytonaEmail"')
  })

  it('parses mylapsSpeedhive segment config', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'mylapsSpeedhive',
            mode: 'practice',
            offset: '0:00',
            driver: 'Test',
            url: 'https://speedhive.mylaps.com/sessions/12345',
          },
        ],
      }),
    )
    const config = await loadTimingConfig(configPath, true)
    expect(config.segments[0].source).toBe('mylapsSpeedhive')
  })

  it('rejects emailPath on mylapsSpeedhive source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'mylapsSpeedhive',
            mode: 'practice',
            offset: '0:00',
            url: 'https://speedhive.mylaps.com/sessions/12345',
            emailPath: 'test.eml',
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow(
      'emailPath is not valid for source "mylapsSpeedhive"',
    )
  })

  it('rejects timingData on mylapsSpeedhive source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'mylapsSpeedhive',
            mode: 'practice',
            offset: '0:00',
            url: 'https://speedhive.mylaps.com/sessions/12345',
            timingData: [{ lap: 1, time: '1:00.000' }],
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('timingData is only valid for source "manual"')
  })

  it('rejects url on manual source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'manual',
            mode: 'practice',
            offset: '0:00',
            driver: 'Test',
            url: 'https://bad.com',
            timingData: [{ lap: 1, time: '1:00.000' }],
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('url is not valid for source "manual"')
  })

  it('rejects emailPath on manual source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'manual',
            mode: 'practice',
            offset: '0:00',
            driver: 'Test',
            emailPath: 'test.eml',
            timingData: [{ lap: 1, time: '1:00.000' }],
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('emailPath is not valid for source "manual"')
  })

  it('rejects non-object positionOverrides entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'alphaTiming',
            mode: 'race',
            offset: '0:00',
            url: 'https://example.com',
            positionOverrides: ['bad'],
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('must be an object')
  })

  it('rejects positionOverrides with missing timestamp', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'alphaTiming',
            mode: 'race',
            offset: '0:00',
            url: 'https://example.com',
            positionOverrides: [{ position: 1 }],
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('missing "timestamp"')
  })

  it('rejects non-array positionOverrides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'alphaTiming',
            mode: 'race',
            offset: '0:00',
            url: 'https://example.com',
            positionOverrides: 'bad',
          },
        ],
      }),
    )
    await expect(loadTimingConfig(configPath, false)).rejects.toThrow('must be an array')
  })
})

describe('resolveDriversCommandSegments', () => {
  it('returns driver display info for cached segments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'cached',
            mode: 'practice',
            offset: '0:00',
            driver: 'Alice',
            originalSource: 'alphaTiming',
            drivers: [
              { kart: '5', name: 'Alice', laps: [{ number: 1, lapTime: 62.5, cumulative: 62.5 }] },
              { kart: '7', name: 'Bob', laps: [{ number: 1, lapTime: 63.0, cumulative: 63.0 }] },
            ],
            capabilities: {
              driverDiscovery: true,
              lapTimes: true,
              bestLap: true,
              lastLap: true,
              position: false,
              classificationPosition: false,
              leaderboard: true,
              gapToLeader: false,
              gapToKartAhead: false,
              gapToKartBehind: false,
              startingGrid: false,
              raceSnapshots: false,
            },
          },
        ],
      }),
    )

    const loaded = await loadTimingConfig(configPath, true)
    const result = await resolveDriversCommandSegments(loaded.segments)

    expect(result).toHaveLength(1)
    expect(result[0].drivers).toHaveLength(2)
    expect(result[0].selectedDriver?.name).toBe('Alice')
  })
})

describe('resolveTimingSegments with alphaTiming source', () => {
  it('resolves alphaTiming practice segment via scraper', async () => {
    const scraper = await import('@racedash/scraper')
    vi.spyOn(scraper, 'fetchHtml').mockResolvedValueOnce('<html>mock</html>')
    vi.spyOn(scraper, 'parseDrivers').mockReturnValueOnce([
      { kart: '5', name: 'Alice', laps: [{ number: 1, lapTime: 62.5, cumulative: 62.5 }] },
      { kart: '7', name: 'Bob', laps: [{ number: 1, lapTime: 63.0, cumulative: 63.0 }] },
    ])

    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'alphaTiming',
            mode: 'practice',
            offset: '0:00',
            driver: 'Alice',
            url: 'https://alphatiming.example.com/session/1',
          },
        ],
      }),
    )

    const loaded = await loadTimingConfig(configPath, true)
    const resolved = await resolveTimingSegments(loaded.segments)

    expect(resolved).toHaveLength(1)
    expect(resolved[0].drivers).toHaveLength(2)
    expect(resolved[0].selectedDriver?.name).toBe('Alice')
    expect(resolved[0].capabilities.driverDiscovery).toBe(true)
    expect(resolved[0].capabilities.lapTimes).toBe(true)
  })

  it('resolves alphaTiming race segment with grid and replay', async () => {
    const scraper = await import('@racedash/scraper')
    vi.spyOn(scraper, 'fetchHtml').mockResolvedValueOnce('<html>mock</html>')
    vi.spyOn(scraper, 'fetchGridHtml').mockResolvedValueOnce('<html>grid</html>')
    vi.spyOn(scraper, 'fetchReplayHtml').mockResolvedValueOnce('<html>replay</html>')
    vi.spyOn(scraper, 'parseDrivers').mockReturnValueOnce([
      { kart: '5', name: 'Alice', laps: [{ number: 1, lapTime: 62.5, cumulative: 62.5 }] },
    ])
    vi.spyOn(scraper, 'parseGrid').mockReturnValueOnce([{ position: 1, kart: '5', name: 'Alice' }])
    vi.spyOn(scraper, 'parseReplayLapData').mockReturnValueOnce({
      snapshots: [
        [
          {
            driverId: 1,
            position: 1,
            kart: '5',
            name: 'Alice',
            lapsCompleted: 1,
            totalSeconds: 62.5,
            gapToLeader: '0.000',
            intervalToAhead: '',
          },
        ],
      ],
    })

    const dir = await mkdtemp(join(tmpdir(), 'racedash-test-'))
    const configPath = join(dir, 'config.json')
    await writeFile(
      configPath,
      JSON.stringify({
        segments: [
          {
            source: 'alphaTiming',
            mode: 'race',
            offset: '0:00',
            driver: 'Alice',
            url: 'https://alphatiming.example.com/session/1',
          },
        ],
      }),
    )

    const loaded = await loadTimingConfig(configPath, true)
    const resolved = await resolveTimingSegments(loaded.segments)

    expect(resolved).toHaveLength(1)
    expect(resolved[0].startingGrid).toHaveLength(1)
    expect(resolved[0].replayData).toBeDefined()
    expect(resolved[0].capabilities.gapToLeader).toBe(true)
    expect(resolved[0].capabilities.startingGrid).toBe(true)
  })
})

describe('buildSessionSegments edge case: no selectedDriver', () => {
  it('throws when no selected driver resolved', () => {
    const resolved = [
      {
        config: { mode: 'practice', label: undefined },
        drivers: [],
        selectedDriver: undefined,
        capabilities: { leaderboard: false },
      },
    ] as any

    expect(() => buildSessionSegments(resolved, [0])).toThrow('No selected driver')
  })
})

describe('extractSpeedhiveSessionId edge cases', () => {
  it('rejects invalid URL', () => {
    expect(() => extractSpeedhiveSessionId('not-a-url')).toThrow('Invalid Daytona Speedhive URL')
  })

  it('rejects wrong hostname', () => {
    expect(() => extractSpeedhiveSessionId('https://example.com/sessions/123')).toThrow('must use speedhive.mylaps.com')
  })

  it('rejects URL without sessions path', () => {
    expect(() => extractSpeedhiveSessionId('https://speedhive.mylaps.com/events/123')).toThrow('numeric /sessions/{id}')
  })
})

describe('validateManualTimingData edge cases', () => {
  it('rejects non-object entries', () => {
    expect(() => validateManualTimingData(['bad'], 0)).toThrow('must be an object')
  })

  it('rejects invalid lap numbers', () => {
    expect(() => validateManualTimingData([{ lap: -1, time: '1:00.000' }], 0)).toThrow('integer >= 0')
  })

  it('rejects starting at lap 2', () => {
    expect(() => validateManualTimingData([{ lap: 2, time: '1:00.000' }], 0)).toThrow('start at lap 0 or lap 1')
  })

  it('rejects non-array or empty timingData', () => {
    expect(() => validateManualTimingData(undefined, 0)).toThrow('non-empty array')
    expect(() => validateManualTimingData([], 0)).toThrow('non-empty array')
  })

  it('rejects invalid time string', () => {
    expect(() => validateManualTimingData([{ lap: 1, time: 'not-a-time' }], 0)).toThrow('lap time string')
  })
})

// ---------------------------------------------------------------------------
// SpeedHive E2E tests with real (anonymised) session data
// ---------------------------------------------------------------------------

const speedhiveFixtureDir = join(__dirname, '__fixtures__')

function loadSpeedhiveFixture(name: string): unknown {
  const raw = require(join(speedhiveFixtureDir, name))
  return raw
}

function buildSpeedhiveFixtureFetch(
  sessionId: string,
  fixtures: Record<string, string>,
): typeof globalThis.fetch {
  return (async (input: string | URL | Request) => {
    const url = input.toString()
    for (const [suffix, fixtureName] of Object.entries(fixtures)) {
      if (url.endsWith(`/sessions/${sessionId}${suffix}`)) {
        return new Response(JSON.stringify(loadSpeedhiveFixture(fixtureName)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    return new Response('not found', { status: 404 })
  }) as typeof globalThis.fetch
}

describe('mylapsSpeedhive E2E — qualifying session (real data)', () => {
  it('resolves all 3 drivers with correct lap counts', async () => {
    vi.stubGlobal(
      'fetch',
      buildSpeedhiveFixtureFetch('99999', {
        '': 'speedhive_qualifying_session.json',
        '/classification': 'speedhive_qualifying_classification.json',
        '/lapdata/1/laps': 'speedhive_qualifying_lapdata_1.json',
        '/lapdata/2/laps': 'speedhive_qualifying_lapdata_2.json',
        '/lapdata/3/laps': 'speedhive_qualifying_lapdata_3.json',
      }),
    )

    const resolved = await resolveTimingSegments([
      {
        driver: 'Ellis',
        source: 'mylapsSpeedhive',
        mode: 'qualifying',
        offset: '0:45.000',
        url: 'https://speedhive.mylaps.com/sessions/99999',
      },
    ])

    expect(resolved).toHaveLength(1)
    const seg = resolved[0]

    // 3 drivers from classification
    expect(seg.drivers).toHaveLength(3)

    // Selected driver by partial name match
    expect(seg.selectedDriver).toBeDefined()
    expect(seg.selectedDriver!.name).toBe('Ellis Evans')
    expect(seg.selectedDriver!.kart).toBe('153')

    // Real session had 12 laps for this driver
    expect(seg.selectedDriver!.laps).toHaveLength(12)
    expect(seg.selectedDriver!.laps[0].lapTime).toBe(51.163)
    expect(seg.selectedDriver!.laps[11].lapTime).toBe(46.848)

    // Cumulative should be sum of all lap times
    const totalTime = seg.selectedDriver!.laps.reduce((sum, lap) => sum + lap.lapTime, 0)
    expect(seg.selectedDriver!.laps[11].cumulative).toBeCloseTo(totalTime, 2)

    // Qualifying capabilities
    expect(seg.capabilities).toMatchObject({
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: true,
      classificationPosition: true,
      leaderboard: true,
      startingGrid: false,
    })

    // No starting grid in qualifying (lapchart not fetched)
    expect(seg.startingGrid).toBeUndefined()
  })

  it('resolves a different driver by name query', async () => {
    vi.stubGlobal(
      'fetch',
      buildSpeedhiveFixtureFetch('99999', {
        '': 'speedhive_qualifying_session.json',
        '/classification': 'speedhive_qualifying_classification.json',
        '/lapdata/1/laps': 'speedhive_qualifying_lapdata_1.json',
        '/lapdata/2/laps': 'speedhive_qualifying_lapdata_2.json',
        '/lapdata/3/laps': 'speedhive_qualifying_lapdata_3.json',
      }),
    )

    const resolved = await resolveTimingSegments([
      {
        driver: 'Kai',
        source: 'mylapsSpeedhive',
        mode: 'qualifying',
        offset: '0:00.000',
        url: 'https://speedhive.mylaps.com/sessions/99999',
      },
    ])

    expect(resolved[0].selectedDriver!.name).toBe('Kai Kent')
    expect(resolved[0].selectedDriver!.kart).toBe('131')
    expect(resolved[0].selectedDriver!.laps).toHaveLength(11)
  })
})

describe('mylapsSpeedhive E2E — race session (real data)', () => {
  it('resolves race drivers with starting grid', async () => {
    vi.stubGlobal(
      'fetch',
      buildSpeedhiveFixtureFetch('88888', {
        '': 'speedhive_race_session.json',
        '/classification': 'speedhive_race_classification.json',
        '/lapchart': 'speedhive_race_lapchart.json',
        '/lapdata/1/laps': 'speedhive_race_lapdata_1.json',
        '/lapdata/2/laps': 'speedhive_race_lapdata_2.json',
        '/lapdata/3/laps': 'speedhive_race_lapdata_3.json',
      }),
    )

    const resolved = await resolveTimingSegments([
      {
        driver: 'Kai',
        source: 'mylapsSpeedhive',
        mode: 'race',
        offset: '1:00.000',
        url: 'https://speedhive.mylaps.com/sessions/88888',
      },
    ])

    const seg = resolved[0]

    // 3 drivers
    expect(seg.drivers).toHaveLength(3)

    // Selected driver
    expect(seg.selectedDriver!.name).toBe('Kai Kent')
    expect(seg.selectedDriver!.kart).toBe('131')
    expect(seg.selectedDriver!.laps).toHaveLength(21)

    // Race session fetches lapchart, so starting grid should exist
    expect(seg.capabilities.startingGrid).toBe(true)
    expect(seg.startingGrid).toBeDefined()
    expect(seg.startingGrid).toHaveLength(3)
    expect(seg.startingGrid![0]).toMatchObject({ position: 1, kart: '131', name: 'Kai Kent' })
    expect(seg.startingGrid![1]).toMatchObject({ position: 2, kart: '153', name: 'Ellis Evans' })
  })

  it('correctly parses lap times with minute notation (e.g. "5:8.916")', async () => {
    vi.stubGlobal(
      'fetch',
      buildSpeedhiveFixtureFetch('88888', {
        '': 'speedhive_race_session.json',
        '/classification': 'speedhive_race_classification.json',
        '/lapchart': 'speedhive_race_lapchart.json',
        '/lapdata/1/laps': 'speedhive_race_lapdata_1.json',
        '/lapdata/2/laps': 'speedhive_race_lapdata_2.json',
        '/lapdata/3/laps': 'speedhive_race_lapdata_3.json',
      }),
    )

    const resolved = await resolveTimingSegments([
      {
        driver: 'Kai',
        source: 'mylapsSpeedhive',
        mode: 'race',
        offset: '0:00.000',
        url: 'https://speedhive.mylaps.com/sessions/88888',
      },
    ])

    const laps = resolved[0].selectedDriver!.laps

    // Lap 1: "58.644" — plain seconds
    expect(laps[0].lapTime).toBe(58.644)

    // Lap 2: "5:8.916" — 5 minutes 8.916 seconds = 308.916s
    expect(laps[1].lapTime).toBe(308.916)

    // Lap 3: "1:0.530" — 1 minute 0.530 seconds = 60.530s
    expect(laps[2].lapTime).toBe(60.53)

    // Cumulative times should be strictly increasing
    for (let i = 1; i < laps.length; i++) {
      expect(laps[i].cumulative).toBeGreaterThan(laps[i - 1].cumulative)
    }
  })

  it('builds session segments with starting grid position for the selected driver', async () => {
    vi.stubGlobal(
      'fetch',
      buildSpeedhiveFixtureFetch('88888', {
        '': 'speedhive_race_session.json',
        '/classification': 'speedhive_race_classification.json',
        '/lapchart': 'speedhive_race_lapchart.json',
        '/lapdata/1/laps': 'speedhive_race_lapdata_1.json',
        '/lapdata/2/laps': 'speedhive_race_lapdata_2.json',
        '/lapdata/3/laps': 'speedhive_race_lapdata_3.json',
      }),
    )

    const resolved = await resolveTimingSegments([
      {
        driver: 'Ellis',
        source: 'mylapsSpeedhive',
        mode: 'race',
        offset: '1:00.000',
        url: 'https://speedhive.mylaps.com/sessions/88888',
      },
    ])

    const { segments, startingGridPosition } = buildSessionSegments(resolved, [60])

    expect(segments).toHaveLength(1)
    expect(segments[0].mode).toBe('race')
    expect(segments[0].session.driver.name).toBe('Ellis Evans')
    expect(segments[0].session.driver.kart).toBe('153')
    expect(segments[0].session.laps).toHaveLength(21)

    // Ellis Evans started P2 on the grid
    expect(startingGridPosition).toBe(2)

    // Leaderboard drivers should include all 3
    expect(segments[0].leaderboardDrivers).toHaveLength(3)

    // Timestamps should all be offset by 60s
    expect(segments[0].session.timestamps[0].ytSeconds).toBeGreaterThanOrEqual(60)
  })
})
