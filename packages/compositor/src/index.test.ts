import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import { joinVideos, getVideoDuration, compositeVideo } from './index'

// execFile mock: used by getVideoDuration (ffprobe calls).
// Returns a valid duration by default so joinVideos can probe inputs.
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], callback: Function) => {
    callback(null, { stdout: '60\n', stderr: '' })
  }),
  spawn: vi.fn(() => makeSpawnResult(0)),
}))

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

/** Creates a fake spawn result that emits close with the given exit code. */
function makeSpawnResult(exitCode: number, stderrOutput?: string) {
  const stderrListeners: ((data: Buffer) => void)[] = []
  const closeListeners: ((code: number) => void)[] = []
  const proc = {
    stderr: {
      on: (_event: string, fn: (data: Buffer) => void) => stderrListeners.push(fn),
    },
    on: (event: string, fn: (code: number) => void) => {
      if (event === 'close') closeListeners.push(fn)
    },
  }
  setImmediate(() => {
    if (stderrOutput) stderrListeners.forEach(fn => fn(Buffer.from(stderrOutput)))
    closeListeners.forEach(fn => fn(exitCode))
  })
  return proc
}

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

  it('calls ffmpeg via spawn with concat demuxer args', async () => {
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    const mockSpawn = vi.mocked(spawn)
    expect(mockSpawn).toHaveBeenCalledOnce()
    const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]]
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
    const mockSpawn = vi.mocked(spawn)
    let tmpFilePath: string | undefined
    mockSpawn.mockImplementationOnce((_cmd, args) => {
      const iIdx = (args as string[]).indexOf('-i')
      tmpFilePath = (args as string[])[iIdx + 1]
      return makeSpawnResult(0) as ReturnType<typeof spawn>
    })
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    await expect(fsp.access(tmpFilePath!)).rejects.toThrow()
  })

  it('deletes temp file after ffmpeg failure', async () => {
    const mockSpawn = vi.mocked(spawn)
    let tmpFilePath: string | undefined
    mockSpawn.mockImplementationOnce((_cmd, args) => {
      const iIdx = (args as string[]).indexOf('-i')
      tmpFilePath = (args as string[])[iIdx + 1]
      return makeSpawnResult(1, 'ffmpeg: error\n') as ReturnType<typeof spawn>
    })
    await expect(joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')).rejects.toThrow()
    await expect(fsp.access(tmpFilePath!)).rejects.toThrow()
  })
})

describe('compositeVideo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips ffprobe when durationSeconds is provided', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', { durationSeconds: 90 })
    // execFile is only used by ffprobe — it must not have been called
    expect(vi.mocked(execFile)).not.toHaveBeenCalled()
  })

  it('calls ffprobe when durationSeconds is not provided', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4')
    expect(vi.mocked(execFile)).toHaveBeenCalledOnce()
  })

  it('uses durationSeconds as the progress denominator', async () => {
    const progressValues: number[] = []
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0, 'frame=10 time=00:00:45.00 bitrate=50\n') as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo(
      '/src.mp4', '/overlay.mov', '/out.mp4',
      { durationSeconds: 90 },
      (p) => progressValues.push(p),
    )
    expect(progressValues).toHaveLength(1)
    expect(progressValues[0]).toBeCloseTo(0.5)
  })

  it('passes -hwaccel videotoolbox to ffmpeg for hardware decode', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', { durationSeconds: 60 })
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
    const hwIdx = args.indexOf('-hwaccel')
    expect(hwIdx).toBeGreaterThan(-1)
    expect(args[hwIdx + 1]).toBe('videotoolbox')
  })
})
