import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import { joinVideos, getVideoDuration } from './index'

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], callback: Function) => {
    callback(null, { stdout: '', stderr: '' })
  }),
}))

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

describe('getVideoDuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns parsed seconds from ffprobe stdout', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '120.5\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).resolves.toBeCloseTo(120.5)
  })

  it('throws when ffprobe returns no duration', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).rejects.toThrow('ffprobe returned no duration')
  })

  it('calls ffprobe with the correct path', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as Function)(null, { stdout: '60\n', stderr: '' })
    })
    await getVideoDuration('/my/video.mp4')
    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as [string, string[]]
    expect(cmd).toBe('ffprobe')
    expect(args[args.length - 1]).toBe('/my/video.mp4')
  })
})

describe('joinVideos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws when fewer than 2 inputs', async () => {
    await expect(joinVideos(['/a.mp4'], '/out.mp4')).rejects.toThrow('at least 2')
  })

  it('calls ffmpeg with concat demuxer args', async () => {
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    const mock = vi.mocked(execFile)
    expect(mock).toHaveBeenCalledOnce()
    const [cmd, args] = mock.mock.calls[0] as [string, string[], Function]
    expect(cmd).toBe('ffmpeg')
    expect(args).toContain('-f')
    expect(args[args.indexOf('-f') + 1]).toBe('concat')
    expect(args).toContain('-c')
    expect(args[args.indexOf('-c') + 1]).toBe('copy')
    expect(args[args.length - 1]).toBe('/out.mp4')
  })

  it('writes absolute file paths to the concat list', async () => {
    const writeMock = vi.mocked(fsp.writeFile)
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    expect(writeMock).toHaveBeenCalledOnce()
    const content = writeMock.mock.calls[0][1] as string
    expect(content).toContain("file '/clip1.mp4'")
    expect(content).toContain("file '/clip2.mp4'")
  })

  it('escapes single quotes in file paths', async () => {
    const writeMock = vi.mocked(fsp.writeFile)
    await joinVideos(["/rider's cam.mp4", '/clip2.mp4'], '/out.mp4')
    const content = writeMock.mock.calls[0][1] as string
    expect(content).toContain("file '/rider'\\''s cam.mp4'")
  })

  it('deletes temp file after success', async () => {
    const mockExecFile = vi.mocked(execFile)
    let tmpFilePath: string | undefined
    mockExecFile.mockImplementationOnce((_cmd, args, callback) => {
      const iIdx = (args as string[]).indexOf('-i')
      tmpFilePath = (args as string[])[iIdx + 1]
      ;(callback as Function)(null, { stdout: '', stderr: '' })
    })
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    await expect(fsp.access(tmpFilePath!)).rejects.toThrow()
  })

  it('deletes temp file after ffmpeg failure', async () => {
    const mockExecFile = vi.mocked(execFile)
    let tmpFilePath: string | undefined
    mockExecFile.mockImplementationOnce((_cmd, args, callback) => {
      const iIdx = (args as string[]).indexOf('-i')
      tmpFilePath = (args as string[])[iIdx + 1]
      ;(callback as Function)(new Error('ffmpeg failed'), null)
    })
    await expect(joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')).rejects.toThrow('ffmpeg failed')
    await expect(fsp.access(tmpFilePath!)).rejects.toThrow()
  })
})
