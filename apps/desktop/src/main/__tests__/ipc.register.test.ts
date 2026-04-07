import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../ffmpeg', () => ({
  getBundledToolPath: vi.fn(() => null),
  resolveFfprobeCommand: vi.fn(() => 'ffprobe'),
}))
vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(),
  listDrivers: vi.fn(),
  generateTimestamps: vi.fn().mockResolvedValue({
    chapters: '',
    segments: [],
    offsets: [],
  }),
  renderBatch: vi.fn().mockResolvedValue(undefined),
  parseFpsValue: vi.fn(),
  buildRaceLapSnapshots: vi.fn().mockReturnValue([]),
  buildSessionSegments: vi.fn().mockReturnValue({ segments: [], startingGridPosition: undefined }),
  loadTimingConfig: vi.fn().mockResolvedValue({ segments: [] }),
  resolveTimingSegments: vi.fn().mockResolvedValue([]),
  resolvePositionOverrides: vi.fn().mockReturnValue([]),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/selected/file.mp4'] }),
  },
  shell: { showItemInFolder: vi.fn() },
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}))
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
    promises: {
      readFile: vi.fn(),
      rm: vi.fn().mockResolvedValue(undefined),
    },
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    rm: vi.fn(),
  },
}))
vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn().mockReturnValue([]),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../cloud-render-handlers', () => ({
  registerCloudRenderHandlers: vi.fn(),
}))

import { ipcMain, dialog, shell } from 'electron'
import { registerIpcHandlers, previewDriversImpl, previewTimestampsImpl } from '../ipc'
import { listDrivers, generateTimestamps, renderBatch } from '@racedash/engine'

describe('registerIpcHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => any>()

  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      handlers.set(channel, handler)
      return undefined as any
    })
    registerIpcHandlers()
  })

  it('registers all expected IPC channels', () => {
    const channels = [...handlers.keys()]
    expect(channels).toContain('racedash:checkFfmpeg')
    expect(channels).toContain('racedash:openFile')
    expect(channels).toContain('racedash:openFiles')
    expect(channels).toContain('racedash:openDirectory')
    expect(channels).toContain('racedash:revealInFinder')
    expect(channels).toContain('racedash:listProjects')
    expect(channels).toContain('racedash:renderBatch:start')
    expect(channels).toContain('racedash:renderBatch:cancel')
    expect(channels).toContain('racedash:renderBatch:retry')
    expect(channels).toContain('racedash:previewDrivers')
    expect(channels).toContain('racedash:previewTimestamps')
    expect(channels).toContain('racedash:getVideoInfo')
  })

  describe('file dialogs', () => {
    it('openFile returns selected file path', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/selected/video.mp4'],
      })
      const result = await handlers.get('racedash:openFile')!({})
      expect(result).toBe('/selected/video.mp4')
    })

    it('openFile returns undefined when cancelled', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: true,
        filePaths: [],
      })
      const result = await handlers.get('racedash:openFile')!({})
      expect(result).toBeUndefined()
    })

    it('openFiles returns multiple file paths', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/a.mp4', '/b.mp4'],
      })
      const result = await handlers.get('racedash:openFiles')!({})
      expect(result).toEqual(['/a.mp4', '/b.mp4'])
    })

    it('openDirectory returns selected directory', async () => {
      vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/selected/dir'],
      })
      const result = await handlers.get('racedash:openDirectory')!({})
      expect(result).toBe('/selected/dir')
    })
  })

  describe('revealInFinder', () => {
    it('calls shell.showItemInFolder for valid path', async () => {
      const fs = await import('node:fs')
      vi.mocked(fs.existsSync).mockReturnValue(true)
      handlers.get('racedash:revealInFinder')!({}, '/valid/path.mp4')
      expect(shell.showItemInFolder).toHaveBeenCalledWith('/valid/path.mp4')
    })

    it('does nothing for empty path', () => {
      handlers.get('racedash:revealInFinder')!({}, '')
      expect(shell.showItemInFolder).not.toHaveBeenCalled()
    })

    it('does nothing for non-existent path', async () => {
      const fs = await import('node:fs')
      vi.mocked(fs.existsSync).mockReturnValue(false)
      handlers.get('racedash:revealInFinder')!({}, '/nonexistent')
      expect(shell.showItemInFolder).not.toHaveBeenCalled()
    })
  })

  describe('startBatchRender', () => {
    it('starts batch render and sends complete event', async () => {
      const mockSend = vi.fn()
      const event = { sender: { send: mockSend, isDestroyed: () => false } }

      handlers.get('racedash:renderBatch:start')!(event, {
        configPath: '/config.json',
        videoPaths: ['/video.mp4'],
        outputDir: '/output',
        style: 'modern',
        renderMode: 'overlay+footage',
        outputResolution: 'source',
        jobs: [{ id: 'job-1', type: 'entireProject', segmentIndices: [0], outputPath: '/output/full.mp4' }],
        cutRegions: [],
        transitions: [],
      })

      // Wait for async render to complete
      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('racedash:renderBatch:complete')
      })
    })

    it('sends batch-error on failure', async () => {
      vi.mocked(renderBatch).mockRejectedValueOnce(new Error('render failed'))
      const mockSend = vi.fn()
      const event = { sender: { send: mockSend, isDestroyed: () => false } }

      handlers.get('racedash:renderBatch:start')!(event, {
        configPath: '/config.json',
        videoPaths: ['/video.mp4'],
        outputDir: '/output',
        style: 'modern',
        renderMode: 'overlay+footage',
        outputResolution: 'source',
        jobs: [{ id: 'job-1', type: 'entireProject', segmentIndices: [0], outputPath: '/output/full.mp4' }],
        cutRegions: [],
        transitions: [],
      })

      await vi.waitFor(() => {
        expect(mockSend).toHaveBeenCalledWith('racedash:renderBatch:job-error', {
          jobId: '__batch__',
          message: 'render failed',
        })
      })
    })
  })

  describe('cancelBatchRender', () => {
    it('aborts active batch render', () => {
      const mockSend = vi.fn()
      const event = { sender: { send: mockSend, isDestroyed: () => false } }
      handlers.get('racedash:renderBatch:start')!(event, {
        configPath: '/c.json',
        videoPaths: ['/v.mp4'],
        outputDir: '/o',
        style: 'modern',
        renderMode: 'overlay+footage',
        outputResolution: 'source',
        jobs: [{ id: 'job-1', type: 'entireProject', segmentIndices: [0], outputPath: '/o/full.mp4' }],
        cutRegions: [],
        transitions: [],
      })

      // cancelBatchRender should not throw
      expect(() => handlers.get('racedash:renderBatch:cancel')!()).not.toThrow()
    })
  })
})

describe('previewDriversImpl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates temp config file and calls listDrivers', async () => {
    vi.mocked(listDrivers).mockResolvedValueOnce({
      segments: [{ drivers: [{ kart: '5', name: 'Alice', laps: [] }] }],
      driverListsIdentical: true,
    } as any)

    const result = await previewDriversImpl([
      { source: 'alphaTiming', url: 'https://example.com', session: 'race', label: 'Seg 1' } as any,
    ])

    expect(listDrivers).toHaveBeenCalledWith({ configPath: expect.stringContaining('racedash-preview-') })
    expect(result.driverListsIdentical).toBe(true)
  })

  it('handles different source types', async () => {
    vi.mocked(listDrivers).mockResolvedValueOnce({
      segments: [],
      driverListsIdentical: true,
    } as any)

    await previewDriversImpl([
      { source: 'daytonaEmail', emailPath: '/email.eml', session: 'practice', label: 'S1' } as any,
      { source: 'teamsportEmail', emailPath: '/ts.eml', session: 'practice', label: 'S2' } as any,
      { source: 'mylapsSpeedhive', eventId: '12345', session: 'race', label: 'S3' } as any,
      { source: 'manual', session: 'practice', label: 'S4' } as any,
    ])

    expect(listDrivers).toHaveBeenCalled()
  })
})

describe('previewTimestampsImpl', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates temp config and returns lap previews', async () => {
    vi.mocked(generateTimestamps).mockResolvedValueOnce({
      chapters: '',
      segments: [
        {
          config: { label: 'Seg 1', source: 'alphaTiming', mode: 'practice' },
          selectedDriver: { kart: '5', laps: [{ number: 1, lapTime: 62.5 }] },
          drivers: [{ kart: '5', laps: [{ lapTime: 62.5 }] }],
        },
      ] as any,
      offsets: [0],
    })

    const result = await previewTimestampsImpl(
      [{ source: 'alphaTiming', url: 'https://example.com', session: 'practice', label: 'Seg 1' } as any],
      { 'Seg 1': 'Alice' },
    )

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Seg 1')
    expect(result[0].laps).toHaveLength(1)
  })
})
