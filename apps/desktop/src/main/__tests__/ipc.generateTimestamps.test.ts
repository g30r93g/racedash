import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(), listDrivers: vi.fn(), generateTimestamps: vi.fn(),
  renderSession: vi.fn(), parseFpsValue: vi.fn(), buildRaceLapSnapshots: vi.fn(),
  buildSessionSegments: vi.fn(),
  loadTimingConfig: vi.fn().mockResolvedValue({ segments: [{ positionOverrides: undefined }] }),
  resolvePositionOverrides: vi.fn().mockReturnValue(undefined),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(), execFileSync: vi.fn(),
}))

import * as engine from '@racedash/engine'
import { generateTimestampsHandler } from '../ipc'

describe('generateTimestampsHandler', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('merges sessionSegments and startingGridPosition from buildSessionSegments', async () => {
    const fakeSegments = [{ mode: 'race' }] as unknown as ReturnType<typeof engine.buildSessionSegments>['segments']
    vi.mocked(engine.generateTimestamps).mockResolvedValue({
      chapters: '',
      segments: [],
      offsets: [0, 30],
    } as unknown as Awaited<ReturnType<typeof engine.generateTimestamps>>)
    vi.mocked(engine.buildSessionSegments).mockReturnValue({
      segments: fakeSegments,
      startingGridPosition: 4,
    } as unknown as ReturnType<typeof engine.buildSessionSegments>)

    const result = await generateTimestampsHandler({ configPath: '/fake/config.json' })

    expect(engine.buildSessionSegments).toHaveBeenCalledWith([], [0, 30])
    expect(result.sessionSegments).toBe(fakeSegments)
    expect(result.startingGridPosition).toBe(4)
    expect(result.chapters).toBe('')
  })
})
