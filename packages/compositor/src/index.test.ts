import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import {
  compositeVideo,
  getOverlayOutputPath,
  getOverlayRenderProfile,
  getVideoDuration,
  getVideoFps,
  getWindowsDecodeCandidateOrder,
  joinVideos,
  normalizeConcatPath,
  parseWindowsHardwareInfo,
} from './index'

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], callback: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
    callback(null, { stdout: '60\n', stderr: '' })
  }),
  spawn: vi.fn(() => makeSpawnResult(0)),
}))

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

function makeSpawnResult(exitCode: number, stderrOutput?: string) {
  const stderrListeners: Array<(data: Buffer) => void> = []
  const closeListeners: Array<(code: number | null, signal: string | null) => void> = []
  const errorListeners: Array<(error: Error) => void> = []
  const proc = {
    stderr: {
      on: (_event: string, fn: (data: Buffer) => void) => stderrListeners.push(fn),
    },
    on: (event: string, fn: (...args: unknown[]) => void) => {
      if (event === 'close') closeListeners.push(fn as (code: number | null, signal: string | null) => void)
      if (event === 'error') errorListeners.push(fn as (error: Error) => void)
    },
  }
  setImmediate(() => {
    if (stderrOutput) stderrListeners.forEach(fn => fn(Buffer.from(stderrOutput)))
    if (exitCode === -1) {
      errorListeners.forEach(fn => fn(Object.assign(new Error('spawn failed'), { code: 'ENOENT' })))
      return
    }
    closeListeners.forEach(fn => fn(exitCode, null))
  })
  return proc
}

describe('overlay profiles', () => {
  it('uses VP9 alpha on Windows', () => {
    expect(getOverlayRenderProfile('win32')).toEqual({
      extension: '.webm',
      codec: 'vp9',
      pixelFormat: 'yuva420p',
      label: 'VP9 alpha (WebM)',
    })
  })

  it('derives the Windows overlay cache path', () => {
    expect(getOverlayOutputPath('/tmp/out.mp4', 'win32')).toBe('/tmp/out-overlay.webm')
  })
})

describe('getVideoDuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns parsed seconds from ffprobe stdout', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '120.5\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).resolves.toBeCloseTo(120.5)
  })

  it('throws when ffprobe returns no duration', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '\n', stderr: '' })
    })
    await expect(getVideoDuration('/clip.mp4')).rejects.toThrow('ffprobe returned no duration')
  })
})

describe('getVideoFps', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses fractional fps from ffprobe stdout', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(
        null,
        { stdout: '60000/1001\n60000/1001\n', stderr: '' },
      )
    })
    await expect(getVideoFps('/clip.mp4')).resolves.toBeCloseTo(60000 / 1001)
  })
})

describe('windows hardware helpers', () => {
  it('parses NVIDIA, Intel, AMD, and unknown vendors', () => {
    const info = parseWindowsHardwareInfo(
      JSON.stringify([
        { Name: 'NVIDIA GeForce RTX 4080', AdapterCompatibility: 'NVIDIA' },
        { Name: 'AMD Radeon RX 7900', AdapterCompatibility: 'Advanced Micro Devices, Inc.' },
        { Name: 'Intel Arc', AdapterCompatibility: 'Intel Corporation' },
        { Name: 'Mystery GPU', AdapterCompatibility: 'Contoso' },
      ]),
      JSON.stringify({ Name: 'Intel(R) Core(TM) i9', Manufacturer: 'GenuineIntel' }),
    )
    expect(info.cpu).toContain('Core')
    expect(info.gpuVendors).toEqual(['nvidia', 'amd', 'intel', 'unknown'])
  })

  it('treats malformed probe output as unknown', () => {
    expect(parseWindowsHardwareInfo('{', '')).toEqual({
      cpu: null,
      cpuManufacturer: null,
      gpuNames: [],
      gpuVendors: ['unknown'],
    })
  })

  it('orders AMD decode candidates correctly', () => {
    expect(getWindowsDecodeCandidateOrder(['amd'], ['cuda', 'd3d11va', 'dxva2'])).toEqual([
      'd3d11va',
      'dxva2',
      'software',
    ])
  })

  it('orders NVIDIA decode candidates correctly', () => {
    expect(getWindowsDecodeCandidateOrder(['nvidia'], ['cuda', 'd3d11va'])).toEqual([
      'cuda',
      'd3d11va',
      'software',
    ])
  })
})

describe('joinVideos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws when fewer than 2 inputs', async () => {
    await expect(joinVideos(['/a.mp4'], '/out.mp4')).rejects.toThrow('at least 2')
  })

  it('writes Windows-safe concat paths', async () => {
    const writeMock = vi.mocked(fsp.writeFile)
    await joinVideos(['C:\\Race Footage\\clip1.mp4', "C:\\Race Footage\\rider's cam.mp4"], '/out.mp4')
    const content = writeMock.mock.calls[0][1] as string
    expect(content).toContain("file 'C:/Race Footage/clip1.mp4'")
    expect(content).toContain("file 'C:/Race Footage/rider'\\''s cam.mp4'")
  })

  it('normalizes single paths consistently', () => {
    expect(normalizeConcatPath("C:\\Race Footage\\rider's cam.mp4")).toBe("C:/Race Footage/rider'\\''s cam.mp4")
  })
})

describe('compositeVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      ;(callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(
        null,
        { stdout: '60\n', stderr: '' },
      )
    })
    vi.mocked(spawn).mockImplementation(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
  })

  it('skips ffprobe when durationSeconds is provided', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
      durationSeconds: 90,
      runtimePlatform: 'darwin',
    })
    expect(vi.mocked(execFile)).not.toHaveBeenCalled()
  })

  it('passes the macOS videotoolbox path by default', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', { durationSeconds: 60, runtimePlatform: 'darwin' })
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
    expect(args).toContain('-hwaccel')
    expect(args[args.indexOf('-hwaccel') + 1]).toBe('videotoolbox')
    expect(args).toContain('hevc_videotoolbox')
  })

  it('uses quality-first Windows output args', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.webm', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'win32',
      ffmpegCapabilities: {
        encoders: new Set(['libx264']),
        hwaccels: new Set(['d3d11va']),
        ffprobeVersion: 'ffprobe version 7.0',
      },
      windowsHardwareInfo: {
        cpu: 'AMD Ryzen',
        cpuManufacturer: 'AuthenticAMD',
        gpuNames: ['AMD Radeon RX 7900'],
        gpuVendors: ['amd'],
      },
      skipDecodePreflight: true,
    })
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
    expect(args).toContain('-hwaccel')
    expect(args[args.indexOf('-hwaccel') + 1]).toBe('d3d11va')
    expect(args).toContain('libx264')
    expect(args).toContain('slow')
    expect(args).toContain('16')
  })

  it('emits software fallback diagnostics on Windows after a failed hardware probe', async () => {
    const diagnostics: Array<{ label: string; value: string }> = []
    vi.mocked(spawn)
      .mockImplementationOnce(
        (_cmd, _args) => makeSpawnResult(1, 'hardware decode failed') as unknown as ReturnType<typeof spawn>,
      )
      .mockImplementationOnce(
        (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
      )
    await compositeVideo('/src.mp4', '/overlay.webm', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'win32',
      ffmpegCapabilities: {
        encoders: new Set(['libx264']),
        hwaccels: new Set(['d3d11va']),
        ffprobeVersion: 'ffprobe version 7.0',
      },
      windowsHardwareInfo: {
        cpu: 'Unknown CPU',
        cpuManufacturer: null,
        gpuNames: ['AMD Radeon'],
        gpuVendors: ['amd'],
      },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })
    expect(diagnostics).toContainEqual({ label: 'Software fallback', value: 'yes' })
  })

  it('does not report a fallback when software decode is the only option', async () => {
    const diagnostics: Array<{ label: string; value: string }> = []
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>,
    )
    await compositeVideo('/src.mp4', '/overlay.webm', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'win32',
      ffmpegCapabilities: {
        encoders: new Set(['libx264']),
        hwaccels: new Set(),
        ffprobeVersion: 'ffprobe version 7.0',
      },
      windowsHardwareInfo: {
        cpu: 'Unknown CPU',
        cpuManufacturer: null,
        gpuNames: [],
        gpuVendors: ['unknown'],
      },
      skipDecodePreflight: true,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    })
    expect(diagnostics).toContainEqual({ label: 'Software fallback', value: 'no' })
  })

  it('throws when libx264 is unavailable on Windows', async () => {
    await expect(compositeVideo('/src.mp4', '/overlay.webm', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'win32',
      ffmpegCapabilities: {
        encoders: new Set(),
        hwaccels: new Set(['d3d11va']),
        ffprobeVersion: 'ffprobe version 7.0',
      },
      windowsHardwareInfo: {
        cpu: 'Intel CPU',
        cpuManufacturer: 'Intel',
        gpuNames: ['Intel Arc'],
        gpuVendors: ['intel'],
      },
      skipDecodePreflight: true,
    })).rejects.toThrow('libx264')
  })
})
