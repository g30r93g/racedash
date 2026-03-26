import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import {
  collectDoctorDiagnostics,
  compositeVideo,
  getOverlayOutputPath,
  getOverlayRenderProfile,
  getVideoDuration,
  getVideoFps,
  getVideoResolution,
  getWindowsDecodeCandidateOrder,
  getWindowsHardwareInfo,
  joinVideos,
  normalizeConcatPath,
  parseFpsValue,
  parseWindowsHardwareInfo,
  probeFfmpegCapabilities,
  renderOverlay,
} from './index'

vi.mock('@remotion/bundler', () => ({
  bundle: vi.fn().mockResolvedValue('http://localhost:3000/bundle'),
}))

vi.mock('@remotion/renderer', () => ({
  selectComposition: vi.fn().mockResolvedValue({
    id: 'TestComp',
    durationInFrames: 300,
    fps: 30,
    width: 1920,
    height: 1080,
  }),
  renderMedia: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      callback(null, { stdout: '60\n', stderr: '' })
    },
  ),
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
    if (stderrOutput) stderrListeners.forEach((fn) => fn(Buffer.from(stderrOutput)))
    if (exitCode === -1) {
      errorListeners.forEach((fn) => fn(Object.assign(new Error('spawn failed'), { code: 'ENOENT' })))
      return
    }
    closeListeners.forEach((fn) => fn(exitCode, null))
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

  it('uses ProRes 4444 on macOS', () => {
    expect(getOverlayRenderProfile('darwin')).toEqual({
      extension: '.mov',
      codec: 'prores',
      proResProfile: '4444',
      pixelFormat: 'yuva444p10le',
      label: 'ProRes 4444 alpha (MOV)',
    })
  })

  it('uses ProRes 4444 on Linux', () => {
    expect(getOverlayRenderProfile('linux')).toEqual({
      extension: '.mov',
      codec: 'prores',
      proResProfile: '4444',
      pixelFormat: 'yuva444p10le',
      label: 'ProRes 4444 alpha (MOV)',
    })
  })

  it('derives the Windows overlay cache path', () => {
    expect(getOverlayOutputPath('/tmp/out.mp4', 'win32')).toBe('/tmp/out-overlay.webm')
  })

  it('derives the macOS overlay cache path', () => {
    expect(getOverlayOutputPath('/tmp/out.mp4', 'darwin')).toBe('/tmp/out-overlay.mov')
  })
})

describe('collectDoctorDiagnostics', () => {
  it('reports Windows defaults and live preference order from injected data', async () => {
    await expect(
      collectDoctorDiagnostics({
        runtimePlatform: 'win32',
        ffmpegCapabilities: {
          encoders: new Set(['libx264', 'h264_nvenc', 'hevc_nvenc']),
          hwaccels: new Set(['d3d11va', 'dxva2']),
          ffprobeVersion: 'ffprobe version 7.1',
        },
        windowsHardwareInfo: {
          cpu: 'AMD Ryzen',
          cpuManufacturer: 'AuthenticAMD',
          gpuNames: ['AMD Radeon RX 7900'],
          gpuVendors: ['amd'],
        },
      }),
    ).resolves.toEqual([
      { label: 'Platform', value: 'win32' },
      { label: 'Overlay', value: 'VP9 alpha (WebM)' },
      { label: 'ffprobe', value: 'ffprobe version 7.1' },
      { label: 'HWAccel', value: 'd3d11va, dxva2' },
      { label: 'Encoders', value: 'libx264, h264_nvenc, hevc_nvenc' },
      { label: 'CPU', value: 'AMD Ryzen' },
      { label: 'GPU', value: 'AMD Radeon RX 7900' },
      { label: 'Decode pref', value: 'd3d11va -> dxva2 -> software' },
      { label: 'Output', value: 'libx264 (preset slow, crf 16)' },
    ])
  })

  it('reports macOS defaults', async () => {
    await expect(
      collectDoctorDiagnostics({
        runtimePlatform: 'darwin',
        ffmpegCapabilities: {
          encoders: new Set(['hevc_videotoolbox', 'libx264']),
          hwaccels: new Set(['videotoolbox']),
          ffprobeVersion: 'ffprobe version 7.1',
        },
      }),
    ).resolves.toEqual([
      { label: 'Platform', value: 'darwin' },
      { label: 'Overlay', value: 'ProRes 4444 alpha (MOV)' },
      { label: 'ffprobe', value: 'ffprobe version 7.1' },
      { label: 'HWAccel', value: 'videotoolbox' },
      { label: 'Encoders', value: 'hevc_videotoolbox, libx264' },
      { label: 'Decode pref', value: 'videotoolbox' },
      { label: 'Output', value: 'hevc_videotoolbox' },
    ])
  })
})

describe('getVideoDuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns parsed seconds from ffprobe stdout', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '120.5\n',
        stderr: '',
      })
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
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '60000/1001\n60000/1001\n',
        stderr: '',
      })
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
    expect(getWindowsDecodeCandidateOrder(['nvidia'], ['cuda', 'd3d11va'])).toEqual(['cuda', 'd3d11va', 'software'])
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
      ;(callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '60\n',
        stderr: '',
      })
    })
    vi.mocked(spawn).mockImplementation((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
  })

  it('skips ffprobe when durationSeconds is provided', async () => {
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
      durationSeconds: 90,
      runtimePlatform: 'darwin',
    })
    expect(vi.mocked(execFile)).not.toHaveBeenCalled()
  })

  it('passes the macOS videotoolbox path by default', async () => {
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', { durationSeconds: 60, runtimePlatform: 'darwin' })
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
    expect(args).toContain('-hwaccel')
    expect(args[args.indexOf('-hwaccel') + 1]).toBe('videotoolbox')
    expect(args).toContain('hevc_videotoolbox')
  })

  it('uses quality-first Windows output args', async () => {
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
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
      .mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
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
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
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
    await expect(
      compositeVideo('/src.mp4', '/overlay.webm', '/out.mp4', {
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
      }),
    ).rejects.toThrow('libx264')
  })

  it('uses generic software path on Linux', async () => {
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'linux',
    })
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
    expect(args).not.toContain('-hwaccel')
    expect(args).toContain('libx264')
    expect(args).toContain('slow')
  })

  it('throws when duration is zero', async () => {
    await expect(
      compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
        durationSeconds: 0,
        runtimePlatform: 'darwin',
      }),
    ).rejects.toThrow('Video duration must be positive')
  })

  it('throws when only outputWidth is provided without outputHeight', async () => {
    await expect(
      compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
        durationSeconds: 60,
        runtimePlatform: 'darwin',
        outputWidth: 1920,
      }),
    ).rejects.toThrow('outputWidth and outputHeight must be provided together')
  })

  it('includes scale filter when outputWidth and outputHeight are provided', async () => {
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'darwin',
      outputWidth: 1920,
      outputHeight: 1080,
    })
    const [, args] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
    const filterIdx = args.indexOf('-filter_complex')
    expect(args[filterIdx + 1]).toContain('scale=1920:1080')
  })

  it('throws on ffmpeg ENOENT error', async () => {
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(-1) as unknown as ReturnType<typeof spawn>)
    await expect(
      compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
        durationSeconds: 60,
        runtimePlatform: 'darwin',
      }),
    ).rejects.toThrow('ffmpeg was not found on PATH')
  })

  it('throws on non-zero ffmpeg exit code', async () => {
    vi.mocked(spawn).mockImplementationOnce(
      (_cmd, _args) => makeSpawnResult(1, 'Some ffmpeg error') as unknown as ReturnType<typeof spawn>,
    )
    await expect(
      compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
        durationSeconds: 60,
        runtimePlatform: 'darwin',
      }),
    ).rejects.toThrow('ffmpeg exited with code 1')
  })

  it('throws on ffmpeg killed by signal', async () => {
    const proc = makeSpawnResult(0)
    const closeListeners: Array<(code: number | null, signal: string | null) => void> = []
    const errorListeners: Array<(error: Error) => void> = []
    const mock = {
      stderr: { on: (_: string, fn: (data: Buffer) => void) => {} },
      on: (event: string, fn: (...args: unknown[]) => void) => {
        if (event === 'close') closeListeners.push(fn as any)
        if (event === 'error') errorListeners.push(fn as any)
      },
    }
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => {
      setImmediate(() => closeListeners.forEach((fn) => fn(null, 'SIGKILL')))
      return mock as unknown as ReturnType<typeof spawn>
    })
    await expect(
      compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
        durationSeconds: 60,
        runtimePlatform: 'darwin',
      }),
    ).rejects.toThrow('ffmpeg killed by signal SIGKILL')
  })

  it('calls onProgress with progress percentage', async () => {
    const stderrListeners: Array<(data: Buffer) => void> = []
    const closeListeners: Array<(code: number | null, signal: string | null) => void> = []
    const mock = {
      stderr: { on: (_: string, fn: (data: Buffer) => void) => stderrListeners.push(fn) },
      on: (event: string, fn: (...args: unknown[]) => void) => {
        if (event === 'close') closeListeners.push(fn as any)
        if (event === 'error') {
        }
      },
    }
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => {
      setImmediate(() => {
        stderrListeners.forEach((fn) => fn(Buffer.from('time=00:00:30.00 bitrate=50000')))
        closeListeners.forEach((fn) => fn(0, null))
      })
      return mock as unknown as ReturnType<typeof spawn>
    })
    const progressValues: number[] = []
    await compositeVideo(
      '/src.mp4',
      '/overlay.mov',
      '/out.mp4',
      {
        durationSeconds: 60,
        runtimePlatform: 'darwin',
      },
      (p) => progressValues.push(p),
    )
    expect(progressValues.length).toBeGreaterThan(0)
    expect(progressValues[0]).toBeCloseTo(0.5)
  })

  it('probes ffprobe for duration when not given', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      ;(callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '120.5\n',
        stderr: '',
      })
    })
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
    await compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
      runtimePlatform: 'darwin',
    })
    expect(vi.mocked(execFile)).toHaveBeenCalled()
  })
})

describe('parseFpsValue', () => {
  it('parses integer fps', () => {
    expect(parseFpsValue('60', '/clip.mp4')).toBe(60)
  })

  it('parses decimal fps', () => {
    expect(parseFpsValue('29.97', '/clip.mp4')).toBeCloseTo(29.97)
  })

  it('parses fractional fps', () => {
    expect(parseFpsValue('60000/1001', '/clip.mp4')).toBeCloseTo(59.94, 1)
  })

  it('throws on zero fps', () => {
    expect(() => parseFpsValue('0', '/clip.mp4')).toThrow('ffprobe returned no fps')
  })

  it('throws on non-numeric value', () => {
    expect(() => parseFpsValue('N/A', '/clip.mp4')).toThrow('ffprobe returned no fps')
  })

  it('throws on empty string', () => {
    expect(() => parseFpsValue('', '/clip.mp4')).toThrow('ffprobe returned no fps')
  })

  it('trims whitespace', () => {
    expect(parseFpsValue('  30  ', '/clip.mp4')).toBe(30)
  })
})

describe('getVideoResolution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses width and height from ffprobe output', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '1920x1080\n',
        stderr: '',
      })
    })
    const result = await getVideoResolution('/clip.mp4')
    expect(result).toEqual({ width: 1920, height: 1080 })
  })

  it('throws when ffprobe returns invalid resolution', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '\n', stderr: '' })
    })
    await expect(getVideoResolution('/clip.mp4')).rejects.toThrow('ffprobe returned no resolution')
  })
})

describe('collectDoctorDiagnostics', () => {
  it('reports Linux/generic defaults', async () => {
    const result = await collectDoctorDiagnostics({
      runtimePlatform: 'linux',
      ffmpegCapabilities: {
        encoders: new Set(['libx264']),
        hwaccels: new Set(),
        ffprobeVersion: 'ffprobe version 7.1',
      },
    })
    expect(result).toContainEqual({ label: 'Platform', value: 'linux' })
    expect(result).toContainEqual({ label: 'Decode pref', value: 'software' })
    expect(result).toContainEqual({ label: 'Output', value: 'libx264 (preset slow, crf 16)' })
  })
})

describe('windows hardware helpers (extended)', () => {
  it('handles null/undefined/empty GPU and CPU JSON', () => {
    expect(parseWindowsHardwareInfo(null, null)).toEqual({
      cpu: null,
      cpuManufacturer: null,
      gpuNames: [],
      gpuVendors: ['unknown'],
    })
    expect(parseWindowsHardwareInfo(undefined, undefined)).toEqual({
      cpu: null,
      cpuManufacturer: null,
      gpuNames: [],
      gpuVendors: ['unknown'],
    })
    expect(parseWindowsHardwareInfo('', '')).toEqual({
      cpu: null,
      cpuManufacturer: null,
      gpuNames: [],
      gpuVendors: ['unknown'],
    })
  })

  it('handles single GPU record (non-array JSON)', () => {
    const info = parseWindowsHardwareInfo(
      JSON.stringify({ Name: 'NVIDIA GeForce RTX 4080', AdapterCompatibility: 'NVIDIA' }),
      JSON.stringify({ Name: 'Intel Core i9', Manufacturer: 'GenuineIntel' }),
    )
    expect(info.gpuNames).toEqual(['NVIDIA GeForce RTX 4080'])
    expect(info.gpuVendors).toEqual(['nvidia'])
    expect(info.cpu).toBe('Intel Core i9')
  })

  it('handles null values in parsed JSON', () => {
    const info = parseWindowsHardwareInfo('null', 'null')
    expect(info).toEqual({
      cpu: null,
      cpuManufacturer: null,
      gpuNames: [],
      gpuVendors: ['unknown'],
    })
  })

  it('orders Intel QSV decode candidates correctly', () => {
    expect(getWindowsDecodeCandidateOrder(['intel'], ['qsv', 'd3d11va', 'dxva2'])).toEqual([
      'qsv',
      'd3d11va',
      'dxva2',
      'software',
    ])
  })

  it('returns software only when no hwaccels match', () => {
    expect(getWindowsDecodeCandidateOrder(['unknown'], new Set())).toEqual(['software'])
  })

  it('deduplicates GPU vendors', () => {
    const info = parseWindowsHardwareInfo(
      JSON.stringify([
        { Name: 'NVIDIA GPU 1', AdapterCompatibility: 'NVIDIA' },
        { Name: 'NVIDIA GPU 2', AdapterCompatibility: 'NVIDIA' },
      ]),
      null,
    )
    expect(info.gpuVendors).toEqual(['nvidia'])
  })
})

describe('getVideoFps (extended)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('falls back to r_frame_rate when avg_frame_rate is invalid', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '0/0\n30\n',
        stderr: '',
      })
    })
    await expect(getVideoFps('/clip.mp4')).resolves.toBe(30)
  })

  it('throws when no valid fps found', async () => {
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '', stderr: '' })
    })
    await expect(getVideoFps('/clip.mp4')).rejects.toThrow('ffprobe returned no fps')
  })
})

describe('probeFfmpegCapabilities', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses encoders, hwaccels, and ffprobe version', async () => {
    let callCount = 0
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      callCount++
      const cmd = _cmd as string
      const args = _args as string[]
      if (args.includes('-encoders')) {
        ;(callback as any)(null, {
          stdout: ' V..... libx264              libx264 H.264\n V..... h264_nvenc           NVIDIA NVENC\n',
          stderr: '',
        })
      } else if (args.includes('-hwaccels')) {
        ;(callback as any)(null, {
          stdout: 'Hardware acceleration methods:\ncuda\nvideotoolbox\n',
          stderr: '',
        })
      } else if (args.includes('-version')) {
        ;(callback as any)(null, {
          stdout: 'ffprobe version 7.1\n',
          stderr: '',
        })
      } else {
        ;(callback as any)(null, { stdout: '', stderr: '' })
      }
    })

    const caps = await probeFfmpegCapabilities()
    expect(caps.encoders.has('libx264')).toBe(true)
    expect(caps.encoders.has('h264_nvenc')).toBe(true)
    expect(caps.hwaccels.has('cuda')).toBe(true)
    expect(caps.hwaccels.has('videotoolbox')).toBe(true)
    expect(caps.ffprobeVersion).toBe('ffprobe version 7.1')
  })
})

describe('getWindowsHardwareInfo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls powershell and parses result', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      const args = _args as string[]
      const command = args[args.length - 1]
      if (command.includes('VideoController')) {
        ;(callback as any)(null, {
          stdout: JSON.stringify([{ Name: 'NVIDIA RTX', AdapterCompatibility: 'NVIDIA' }]),
          stderr: '',
        })
      } else {
        ;(callback as any)(null, {
          stdout: JSON.stringify({ Name: 'Intel i9', Manufacturer: 'Intel' }),
          stderr: '',
        })
      }
    })

    const info = await getWindowsHardwareInfo()
    expect(info.gpuNames).toContain('NVIDIA RTX')
    expect(info.cpu).toBe('Intel i9')
  })

  it('handles powershell ENOENT gracefully', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      ;(callback as any)(err)
    })

    const info = await getWindowsHardwareInfo()
    expect(info.cpu).toBeNull()
    expect(info.gpuNames).toEqual([])
  })

  it('handles powershell non-ENOENT errors gracefully', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      ;(callback as any)(new Error('permission denied'))
    })

    const info = await getWindowsHardwareInfo()
    expect(info.cpu).toBeNull()
  })
})

describe('collectDoctorDiagnostics without injected capabilities', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls probeFfmpegCapabilities when not injected', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      const args = _args as string[]
      if (args.includes('-encoders')) {
        ;(callback as any)(null, { stdout: ' V..... libx264\n', stderr: '' })
      } else if (args.includes('-hwaccels')) {
        ;(callback as any)(null, { stdout: 'Hardware acceleration methods:\n', stderr: '' })
      } else if (args.includes('-version')) {
        ;(callback as any)(null, { stdout: 'ffprobe version 7.0\n', stderr: '' })
      } else {
        ;(callback as any)(null, { stdout: '', stderr: '' })
      }
    })

    const result = await collectDoctorDiagnostics({ runtimePlatform: 'linux' })
    expect(result).toContainEqual({ label: 'Platform', value: 'linux' })
    expect(result).toContainEqual(expect.objectContaining({ label: 'ffprobe' }))
  })
})

describe('compositeVideo Windows without injected capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      const args = _args as string[]
      if (args.includes('-encoders')) {
        ;(callback as any)(null, { stdout: ' V..... libx264\n', stderr: '' })
      } else if (args.includes('-hwaccels')) {
        ;(callback as any)(null, { stdout: 'Hardware acceleration methods:\n', stderr: '' })
      } else if (args.includes('-version')) {
        ;(callback as any)(null, { stdout: 'ffprobe version 7.0\n', stderr: '' })
      } else if (String(_cmd) === 'powershell') {
        ;(callback as any)(null, { stdout: 'null', stderr: '' })
      } else {
        ;(callback as any)(null, { stdout: '60\n', stderr: '' })
      }
    })
  })

  it('calls probeFfmpegCapabilities and getWindowsHardwareInfo when not injected', async () => {
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
    await compositeVideo('/src.mp4', '/overlay.webm', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'win32',
      skipDecodePreflight: true,
    })
    expect(vi.mocked(spawn)).toHaveBeenCalled()
  })
})

describe('execTool error handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws friendly ENOENT error for missing ffprobe', async () => {
    const enoentError = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: Error) => void)(enoentError)
    })
    await expect(getVideoDuration('/clip.mp4')).rejects.toThrow('was not found on PATH')
  })

  it('rethrows non-ENOENT errors', async () => {
    const otherError = new Error('permission denied')
    vi.mocked(execFile).mockImplementationOnce((_cmd, _args, callback) => {
      ;(callback as (err: Error) => void)(otherError)
    })
    await expect(getVideoDuration('/clip.mp4')).rejects.toThrow('permission denied')
  })
})

describe('renderOverlay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders with ProRes 4444 on macOS', async () => {
    const { renderMedia } = await import('@remotion/renderer')

    await renderOverlay('/entry.tsx', 'TestComp', {} as any, '/out-overlay.mov', undefined, 'darwin')

    expect(vi.mocked(renderMedia)).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: 'prores',
        proResProfile: '4444',
        pixelFormat: 'yuva444p10le',
      }),
    )
  })

  it('renders with VP9 on Windows', async () => {
    const { renderMedia } = await import('@remotion/renderer')

    await renderOverlay('/entry.tsx', 'TestComp', {} as any, '/out-overlay.webm', undefined, 'win32')

    expect(vi.mocked(renderMedia)).toHaveBeenCalledWith(
      expect.objectContaining({
        codec: 'vp9',
        pixelFormat: 'yuva420p',
      }),
    )
  })

  it('calls onProgress with totalFrames', async () => {
    const { renderMedia } = await import('@remotion/renderer')
    const progressFn = vi.fn()

    vi.mocked(renderMedia).mockImplementationOnce(async (opts: any) => {
      opts.onProgress?.({ progress: 0.5, renderedFrames: 150 })
    })

    await renderOverlay('/entry.tsx', 'TestComp', {} as any, '/out-overlay.mov', progressFn, 'darwin')

    expect(progressFn).toHaveBeenCalledWith({
      progress: 0.5,
      renderedFrames: 150,
      totalFrames: 300,
    })
  })
})

describe('compositeVideo Windows decode validation (no skipDecodePreflight)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      ;(callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '60\n',
        stderr: '',
      })
    })
  })

  it('tries hardware decode candidates and falls back to software', async () => {
    const diagnostics: Array<{ label: string; value: string }> = []
    // First spawn: validation probe for d3d11va fails
    // Second spawn: actual ffmpeg composite with software
    vi.mocked(spawn)
      .mockImplementationOnce(
        (_cmd, _args) => makeSpawnResult(1, 'decode failed') as unknown as ReturnType<typeof spawn>,
      )
      .mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)

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
        gpuNames: ['AMD Radeon'],
        gpuVendors: ['amd'],
      },
      onDiagnostic: (d) => diagnostics.push(d),
    })

    expect(diagnostics).toContainEqual(expect.objectContaining({ label: 'Decode probe' }))
    expect(diagnostics).toContainEqual({ label: 'Decode', value: 'software' })
  })

  it('uses hardware decode when validation succeeds', async () => {
    // First spawn: validation probe succeeds
    // Second spawn: actual ffmpeg composite
    vi.mocked(spawn)
      .mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)
      .mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)

    await compositeVideo('/src.mp4', '/overlay.webm', '/out.mp4', {
      durationSeconds: 60,
      runtimePlatform: 'win32',
      ffmpegCapabilities: {
        encoders: new Set(['libx264']),
        hwaccels: new Set(['cuda', 'd3d11va']),
        ffprobeVersion: 'ffprobe version 7.0',
      },
      windowsHardwareInfo: {
        cpu: 'Intel CPU',
        cpuManufacturer: 'Intel',
        gpuNames: ['NVIDIA RTX 4080'],
        gpuVendors: ['nvidia'],
      },
    })

    const [, firstArgs] = vi.mocked(spawn).mock.calls[0] as [string, string[]]
    // First call is the validation probe
    expect(firstArgs).toContain('-hwaccel')
    expect(firstArgs).toContain('cuda')
  })
})

describe('compositeVideo non-ENOENT spawn error', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rethrows non-ENOENT spawn errors', async () => {
    const errorListeners: Array<(error: Error) => void> = []
    const mock = {
      stderr: { on: () => {} },
      on: (event: string, fn: (...args: unknown[]) => void) => {
        if (event === 'error') errorListeners.push(fn as any)
        if (event === 'close') {
        }
      },
    }
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => {
      setImmediate(() => {
        errorListeners.forEach((fn) => fn(new Error('EPERM: operation not permitted')))
      })
      return mock as unknown as ReturnType<typeof spawn>
    })
    await expect(
      compositeVideo('/src.mp4', '/overlay.mov', '/out.mp4', {
        durationSeconds: 60,
        runtimePlatform: 'darwin',
      }),
    ).rejects.toThrow('EPERM')
  })
})

describe('compositeVideo Windows decode signal handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      ;(callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '60\n',
        stderr: '',
      })
    })
  })

  it('reports signal failure during decode validation', async () => {
    const diagnostics: Array<{ label: string; value: string }> = []
    // First spawn: validation probe killed by signal
    const signalProc = (() => {
      const closeListeners: Array<(code: number | null, signal: string | null) => void> = []
      const mock = {
        stderr: { on: (_: string, fn: (data: Buffer) => void) => {} },
        on: (event: string, fn: (...args: unknown[]) => void) => {
          if (event === 'close') closeListeners.push(fn as any)
          if (event === 'error') {
          }
        },
      }
      setImmediate(() => closeListeners.forEach((fn) => fn(null, 'SIGKILL')))
      return mock
    })()

    vi.mocked(spawn)
      .mockImplementationOnce((_cmd, _args) => signalProc as unknown as ReturnType<typeof spawn>)
      .mockImplementationOnce((_cmd, _args) => makeSpawnResult(0) as unknown as ReturnType<typeof spawn>)

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
        gpuNames: ['AMD Radeon'],
        gpuVendors: ['amd'],
      },
      onDiagnostic: (d) => diagnostics.push(d),
    })

    expect(diagnostics).toContainEqual(expect.objectContaining({ label: 'Decode probe' }))
  })
})

describe('joinVideos with progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback) => {
      ;(callback as (err: Error | null, result: { stdout: string; stderr: string }) => void)(null, {
        stdout: '30\n',
        stderr: '',
      })
    })
  })

  it('reports formatted progress to stderr', async () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const stderrListeners: Array<(data: Buffer) => void> = []
    const closeListeners: Array<(code: number | null, signal: string | null) => void> = []
    const mock = {
      stderr: { on: (_: string, fn: (data: Buffer) => void) => stderrListeners.push(fn) },
      on: (event: string, fn: (...args: unknown[]) => void) => {
        if (event === 'close') closeListeners.push(fn as any)
        if (event === 'error') {
        }
      },
    }
    vi.mocked(spawn).mockImplementationOnce((_cmd, _args) => {
      setImmediate(() => {
        stderrListeners.forEach((fn) => fn(Buffer.from('time=00:00:15.00')))
        closeListeners.forEach((fn) => fn(0, null))
      })
      return mock as unknown as ReturnType<typeof spawn>
    })
    await joinVideos(['/a.mp4', '/b.mp4'], '/out.mp4')
    expect(stderrWrite).toHaveBeenCalled()
    const written = stderrWrite.mock.calls.map((c) => String(c[0])).join('')
    expect(written).toContain('Progress:')
    stderrWrite.mockRestore()
  })
})
