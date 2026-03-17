import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'

vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(),
  listDrivers: vi.fn(),
  generateTimestamps: vi.fn(),
  renderSession: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

import { joinVideos as engineJoinVideos } from '@racedash/engine'
import { joinVideosImpl } from '../ipc'

const mockEngineJoinVideos = vi.mocked(engineJoinVideos)

beforeEach(() => {
  vi.clearAllMocks()
  mockEngineJoinVideos.mockResolvedValue(undefined)
})

describe('joinVideosImpl', () => {
  it('returns the original path unchanged for a single file', async () => {
    const result = await joinVideosImpl(['/videos/chapter1.mp4'])
    expect(result).toBe('/videos/chapter1.mp4')
    expect(mockEngineJoinVideos).not.toHaveBeenCalled()
  })

  it('calls engine joinVideos for multiple files', async () => {
    await joinVideosImpl(['/videos/ch1.mp4', '/videos/ch2.mp4'])
    expect(mockEngineJoinVideos).toHaveBeenCalledWith(
      ['/videos/ch1.mp4', '/videos/ch2.mp4'],
      expect.stringContaining('racedash-join-')
    )
  })

  it('returns a path in the system temp directory for multiple files', async () => {
    const result = await joinVideosImpl(['/videos/ch1.mp4', '/videos/ch2.mp4'])
    expect(path.resolve(result)).toContain(path.resolve(os.tmpdir()))
    expect(result).toMatch(/\.mp4$/)
  })

  it('rejects when the engine throws', async () => {
    mockEngineJoinVideos.mockRejectedValue(new Error('ffmpeg not found'))
    await expect(joinVideosImpl(['/videos/ch1.mp4', '/videos/ch2.mp4'])).rejects.toThrow('ffmpeg not found')
  })

  it('rejects when called with an empty array', async () => {
    await expect(joinVideosImpl([])).rejects.toThrow('at least one video path is required')
    expect(mockEngineJoinVideos).not.toHaveBeenCalled()
  })
})
