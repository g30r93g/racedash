import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@racedash/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@racedash/engine')>()
  return {
    ...actual,
    loadTimingConfig: vi.fn().mockResolvedValue({ segments: [{}] }),
    resolveTimingSegments: vi.fn().mockResolvedValue([{ drivers: [], capabilities: {}, startingGrid: [], replayData: [] }]),
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      rm: vi.fn().mockResolvedValue(undefined),
    },
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
  },
  promises: {
    readFile: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn(),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
  _resetQueueForTesting: vi.fn(),
}))

import fs from 'node:fs'
import { buildEngineSegments, updateProjectHandler } from '../ipc'
import type { SegmentConfig } from '../../types/project'

const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockWriteFileSync = vi.mocked(fs.writeFileSync)

const PROJECT_PATH = '/projects/my-race/project.json'
const CONFIG_PATH = '/projects/my-race/config.json'

const SAMPLE_PROJECT = {
  name: 'My Race',
  projectPath: PROJECT_PATH,
  configPath: CONFIG_PATH,
  videoPaths: ['/projects/my-race/video.mp4'],
  segments: [{ label: 'Race', source: 'alphaTiming', url: 'https://example.com' }],
  selectedDriver: 'G. Gorzynski',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildEngineSegments', () => {
  it('converts alphaTiming segment', () => {
    const segments: SegmentConfig[] = [
      { label: 'Race', source: 'alphaTiming', url: 'https://example.com', videoOffsetFrame: 100 },
    ]
    const result = buildEngineSegments(segments)
    expect(result).toEqual([
      { source: 'alphaTiming', mode: 'race', offset: '100 F', label: 'Race', url: 'https://example.com' },
    ])
  })

  it('converts daytonaEmail segment', () => {
    const segments: SegmentConfig[] = [
      { label: 'Practice', source: 'daytonaEmail', session: 'practice', emailPath: '/path/to/email.eml' },
    ]
    const result = buildEngineSegments(segments)
    expect(result).toEqual([
      { source: 'daytonaEmail', mode: 'practice', offset: '0 F', label: 'Practice', emailPath: '/path/to/email.eml' },
    ])
  })

  it('converts teamsportEmail segment', () => {
    const segments: SegmentConfig[] = [
      { label: 'Race', source: 'teamsportEmail', emailPath: '/path/to/email.txt' },
    ]
    const result = buildEngineSegments(segments)
    expect(result).toEqual([
      { source: 'teamsportEmail', mode: 'race', offset: '0 F', label: 'Race', emailPath: '/path/to/email.txt' },
    ])
  })

  it('converts mylapsSpeedhive segment with url', () => {
    const segments: SegmentConfig[] = [
      { label: 'Qualifying', source: 'mylapsSpeedhive', session: 'qualifying', url: 'https://speedhive.mylaps.com/Sessions/123' },
    ]
    const result = buildEngineSegments(segments)
    expect(result).toEqual([
      { source: 'mylapsSpeedhive', mode: 'qualifying', offset: '0 F', label: 'Qualifying', url: 'https://speedhive.mylaps.com/Sessions/123' },
    ])
  })

  it('constructs speedhive url from eventId when url is missing', () => {
    const segments: SegmentConfig[] = [
      { label: 'Race', source: 'mylapsSpeedhive', eventId: '456' },
    ]
    const result = buildEngineSegments(segments)
    expect(result[0]).toMatchObject({ url: 'https://speedhive.mylaps.com/Sessions/456' })
  })

  it('converts manual segment with empty timingData', () => {
    const segments: SegmentConfig[] = [
      { label: 'Race', source: 'manual' },
    ]
    const result = buildEngineSegments(segments)
    expect(result).toEqual([
      { source: 'manual', mode: 'race', offset: '0 F', label: 'Race', timingData: [] },
    ])
  })

  it('defaults mode to race when session is undefined', () => {
    const segments: SegmentConfig[] = [
      { label: 'Race', source: 'alphaTiming', url: 'https://example.com' },
    ]
    const result = buildEngineSegments(segments)
    expect(result[0]).toMatchObject({ mode: 'race' })
  })

  it('defaults videoOffsetFrame to 0 when undefined', () => {
    const segments: SegmentConfig[] = [
      { label: 'Race', source: 'alphaTiming', url: 'https://example.com' },
    ]
    const result = buildEngineSegments(segments)
    expect(result[0]).toMatchObject({ offset: '0 F' })
  })
})

describe('updateProjectHandler', () => {
  const newSegments: SegmentConfig[] = [
    { label: 'Qualifying', source: 'alphaTiming', url: 'https://example.com/q', session: 'qualifying', videoOffsetFrame: 50 },
  ]

  it('updates project.json and config.json with new segments and driver', async () => {
    const existingConfig = { segments: [], driver: 'G. Gorzynski', overlayType: 'banner', styling: { color: 'red' } }
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(SAMPLE_PROJECT)) // project.json
      .mockReturnValueOnce(JSON.stringify(existingConfig)) // config.json

    const result = await updateProjectHandler(PROJECT_PATH, newSegments, 'A. Smith')

    // config.json: preserves overlayType and styling, updates segments + driver
    const configWriteCall = mockWriteFileSync.mock.calls.find(c => c[0] === CONFIG_PATH)
    expect(configWriteCall).toBeDefined()
    const writtenConfig = JSON.parse(configWriteCall![1] as string)
    expect(writtenConfig.overlayType).toBe('banner')
    expect(writtenConfig.styling).toEqual({ color: 'red' })
    expect(writtenConfig.driver).toBe('A. Smith')
    // Remote segments get cached (resolved to 'cached' source with inline data)
    expect(writtenConfig.segments).toEqual([
      {
        source: 'cached', mode: 'qualifying', offset: '50 F', label: 'Qualifying',
        originalSource: 'alphaTiming',
        drivers: [], capabilities: {}, startingGrid: [], replayData: [],
      },
    ])

    // project.json: updated segments + driver
    const projectWriteCall = mockWriteFileSync.mock.calls.find(c => c[0] === PROJECT_PATH)
    expect(projectWriteCall).toBeDefined()
    const writtenProject = JSON.parse(projectWriteCall![1] as string)
    expect(writtenProject.segments).toEqual(newSegments)
    expect(writtenProject.selectedDriver).toBe('A. Smith')
    expect(writtenProject.name).toBe('My Race') // preserved

    // Return value
    expect(result.selectedDriver).toBe('A. Smith')
    expect(result.segments).toEqual(newSegments)
  })

  it('preserves existing config keys like positionOverrides', async () => {
    const existingConfig = {
      segments: [{ positionOverrides: [{ timestamp: '0:08', position: 3 }] }],
      driver: 'G. Gorzynski',
      boxPosition: 'top-right',
    }
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(SAMPLE_PROJECT))
      .mockReturnValueOnce(JSON.stringify(existingConfig))

    await updateProjectHandler(PROJECT_PATH, newSegments, 'A. Smith')

    const configWriteCall = mockWriteFileSync.mock.calls.find(c => c[0] === CONFIG_PATH)
    const writtenConfig = JSON.parse(configWriteCall![1] as string)
    expect(writtenConfig.boxPosition).toBe('top-right')
  })

  it('handles missing config.json gracefully', async () => {
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(SAMPLE_PROJECT))
      .mockImplementationOnce(() => { throw new Error('ENOENT') })

    const result = await updateProjectHandler(PROJECT_PATH, newSegments, 'A. Smith')
    expect(result.selectedDriver).toBe('A. Smith')
  })

  it('throws when projectPath is empty', async () => {
    await expect(updateProjectHandler('', newSegments, 'A. Smith')).rejects.toThrow('non-empty string')
  })

  it('throws when projectPath does not end with project.json', async () => {
    await expect(updateProjectHandler('/etc/passwd', newSegments, 'A. Smith')).rejects.toThrow('project.json')
  })

  it('throws when segments is empty', async () => {
    await expect(updateProjectHandler(PROJECT_PATH, [], 'A. Smith')).rejects.toThrow('non-empty array')
  })

  it('throws when selectedDriver is empty', async () => {
    await expect(updateProjectHandler(PROJECT_PATH, newSegments, '')).rejects.toThrow('non-empty string')
  })
})
