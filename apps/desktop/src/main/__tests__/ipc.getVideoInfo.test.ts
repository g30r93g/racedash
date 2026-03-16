import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as childProcess from 'node:child_process'

import { getVideoInfo } from '../ipc'

vi.mock('node:child_process')
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

const MOCK_FFPROBE_OUTPUT = JSON.stringify({
  streams: [
    {
      codec_type: 'audio',
      r_frame_rate: '0/0',
      duration: '0',
    },
    {
      codec_type: 'video',
      width: 1920,
      height: 1080,
      r_frame_rate: '60000/1001',
      duration: '300.5',
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getVideoInfo', () => {
  it('parses width and height from the video stream', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(MOCK_FFPROBE_OUTPUT))
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
  })

  it('parses duration as a float', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(MOCK_FFPROBE_OUTPUT))
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.durationSeconds).toBeCloseTo(300.5)
  })

  it('parses fps from a fractional r_frame_rate field (60000/1001 → ~59.94)', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(MOCK_FFPROBE_OUTPUT))
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.fps).toBeCloseTo(59.94, 1)
  })

  it('parses fps from a whole-number r_frame_rate field (30/1 → 30)', () => {
    const output = JSON.stringify({
      streams: [
        { codec_type: 'video', width: 1280, height: 720, r_frame_rate: '30/1', duration: '60' },
      ],
    })
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(output))
    const result = getVideoInfo('/path/to/video.mp4')
    expect(result.fps).toBeCloseTo(30, 1)
  })

  it('passes the video path as a discrete argument (not shell-interpolated)', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(MOCK_FFPROBE_OUTPUT))
    getVideoInfo('/my/video.mp4')
    const callArgs = vi.mocked(childProcess.execFileSync).mock.calls[0]
    expect(callArgs[0]).toBe('ffprobe')
    expect(callArgs[1]).toEqual(expect.arrayContaining(['/my/video.mp4']))
  })

  it('throws a descriptive error when ffprobe is not found', () => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      const err = new Error('ffprobe: not found') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    expect(() => getVideoInfo('/path/to/video.mp4')).toThrow(/ffprobe not found/i)
  })

  it('skips non-video streams and picks the first video stream', () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(MOCK_FFPROBE_OUTPUT))
    const result = getVideoInfo('/path/to/video.mp4')
    // Width must come from the video stream (index 1), not audio (index 0)
    expect(result.width).toBe(1920)
  })

  it('throws when no video stream is found in ffprobe output', () => {
    const output = JSON.stringify({
      streams: [{ codec_type: 'audio', r_frame_rate: '0/0', duration: '0' }],
    })
    vi.mocked(childProcess.execFileSync).mockReturnValue(Buffer.from(output))
    expect(() => getVideoInfo('/path/to/video.mp4')).toThrow(/no video stream/i)
  })
})
