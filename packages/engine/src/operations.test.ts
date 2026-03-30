import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getRenderExperimentalWarning,
  runDoctor,
  joinVideos,
  listDrivers,
  generateTimestamps,
  renderSession,
} from './operations'

// Mock all external dependencies
vi.mock('@racedash/compositor', () => ({
  collectDoctorDiagnostics: vi.fn().mockResolvedValue([
    { label: 'Platform', value: 'darwin' },
    { label: 'ffprobe', value: 'ffprobe version 7.1' },
  ]),
  compositeVideo: vi.fn().mockResolvedValue(undefined),
  getOverlayOutputPath: vi.fn((p: string) => p.replace(/\.[^.]+$/, '-overlay.mov')),
  getVideoDuration: vi.fn().mockResolvedValue(120),
  getVideoFps: vi.fn().mockResolvedValue(60),
  getVideoResolution: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
  joinVideos: vi.fn().mockResolvedValue(undefined),
  renderOverlay: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@racedash/core', () => ({
  DEFAULT_LABEL_WINDOW_SECONDS: 3,
}))

vi.mock('@racedash/timestamps', () => ({
  formatChapters: vi.fn().mockReturnValue('00:00 Segment 1\n02:00 Segment 2'),
  parseOffset: vi.fn().mockReturnValue(0),
}))

vi.mock('./timingSources', () => ({
  buildSessionSegments: vi.fn().mockReturnValue({
    segments: [{ laps: [], positionOverrides: [] }],
    startingGridPosition: null,
  }),
  driverListsAreIdentical: vi.fn().mockReturnValue(true),
  flattenTimestamps: vi.fn().mockReturnValue([]),
  loadTimingConfig: vi.fn().mockResolvedValue({
    segments: [
      {
        source: 'alphaTiming' as const,
        mode: 'race' as const,
        offset: '0:00',
        url: 'https://example.com',
        driver: 'Test Driver',
      },
    ],
    configBoxPosition: undefined,
    configTablePosition: undefined,
    overlayComponents: undefined,
    styling: undefined,
  }),
  resolveDriversCommandSegments: vi
    .fn()
    .mockResolvedValue([{ drivers: ['Driver A', 'Driver B'], source: 'alphaTiming' }]),
  resolvePositionOverrides: vi.fn().mockReturnValue([]),
  resolveSegmentPositionOverrides: vi.fn().mockReturnValue([]),
  resolveTimingSegments: vi.fn().mockResolvedValue([{ mode: 'race', laps: [], source: 'alphaTiming' }]),
}))

vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>()
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
    unlink: vi.fn().mockResolvedValue(undefined),
  }
})

import {
  compositeVideo,
  getVideoDuration,
  joinVideos as compositorJoinVideos,
  renderOverlay,
} from '@racedash/compositor'
import { loadTimingConfig, resolveDriversCommandSegments, resolveTimingSegments } from './timingSources'
import { access, unlink } from 'node:fs/promises'

describe('getRenderExperimentalWarning', () => {
  it('returns undefined on non-Windows platforms', () => {
    expect(getRenderExperimentalWarning('darwin')).toBeUndefined()
    expect(getRenderExperimentalWarning('linux')).toBeUndefined()
  })

  it('returns a warning string on Windows', () => {
    const warning = getRenderExperimentalWarning('win32')
    expect(typeof warning).toBe('string')
    expect(warning!.length).toBeGreaterThan(0)
  })
})

describe('runDoctor', () => {
  it('returns diagnostics from compositor', async () => {
    const result = await runDoctor()
    expect(result).toEqual([
      { label: 'Platform', value: 'darwin' },
      { label: 'ffprobe', value: 'ffprobe version 7.1' },
    ])
  })
})

describe('joinVideos', () => {
  it('delegates to compositor joinVideos', async () => {
    await joinVideos(['/a.mp4', '/b.mp4'], '/out.mp4')
    expect(compositorJoinVideos).toHaveBeenCalledWith(['/a.mp4', '/b.mp4'], '/out.mp4')
  })
})

describe('listDrivers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads config and returns driver segments', async () => {
    const result = await listDrivers({ configPath: '/config.yaml' })
    expect(loadTimingConfig).toHaveBeenCalledWith('/config.yaml', false)
    expect(result.segments).toEqual([{ drivers: ['Driver A', 'Driver B'], source: 'alphaTiming' }])
    expect(result.driverListsIdentical).toBe(true)
  })

  it('applies driverQuery filter to segments', async () => {
    await listDrivers({ configPath: '/config.yaml', driverQuery: 'Smith' })
    expect(resolveDriversCommandSegments).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ driver: 'Smith' })]),
    )
  })
})

describe('generateTimestamps', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads config and returns chapters with segments', async () => {
    const result = await generateTimestamps({ configPath: '/config.yaml' })
    expect(loadTimingConfig).toHaveBeenCalledWith('/config.yaml', true)
    expect(result.chapters).toContain('Segment 1')
    expect(result.segments).toHaveLength(1)
    expect(result.offsets).toHaveLength(1)
  })
})

describe('renderSession', () => {
  const baseOpts = {
    configPath: '/config.yaml',
    videoPaths: ['/video.mp4'],
    outputPath: '/output.mp4',
    rendererEntry: '/renderer/src/index.ts',
    style: 'modern',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
  })

  it('renders overlay and composites video', async () => {
    const progress: Array<{ phase: string; progress: number }> = []
    const result = await renderSession(baseOpts, (e) => progress.push(e))

    expect(loadTimingConfig).toHaveBeenCalledWith('/config.yaml', true)
    expect(renderOverlay).toHaveBeenCalled()
    expect(compositeVideo).toHaveBeenCalled()
    expect(result.outputPath).toBe('/output.mp4')
    expect(result.overlayReused).toBe(false)
  })

  it('joins multiple videos before rendering', async () => {
    const progress: Array<{ phase: string; progress: number }> = []
    await renderSession({ ...baseOpts, videoPaths: ['/clip1.mp4', '/clip2.mp4'] }, (e) => progress.push(e))

    expect(compositorJoinVideos).toHaveBeenCalledWith(
      ['/clip1.mp4', '/clip2.mp4'],
      expect.stringContaining('racedash-joined-'),
    )
    expect(progress).toContainEqual({ phase: 'Joining videos', progress: 0 })
    expect(progress).toContainEqual({ phase: 'Joining videos', progress: 1 })
    // Should clean up temp joined video
    expect(unlink).toHaveBeenCalled()
  })

  it('reuses cached overlay when available', async () => {
    vi.mocked(access).mockResolvedValueOnce(undefined)
    vi.mocked(getVideoDuration).mockResolvedValueOnce(120).mockResolvedValueOnce(120)

    const result = await renderSession(baseOpts, () => {})

    expect(renderOverlay).not.toHaveBeenCalled()
    expect(result.overlayReused).toBe(true)
  })

  it('skips cache check when noCache is true', async () => {
    vi.mocked(access).mockResolvedValueOnce(undefined)
    vi.mocked(getVideoDuration).mockResolvedValueOnce(120)

    await renderSession({ ...baseOpts, noCache: true }, () => {})

    expect(renderOverlay).toHaveBeenCalled()
  })

  it('returns overlay path when onlyRenderOverlay is true', async () => {
    const result = await renderSession({ ...baseOpts, onlyRenderOverlay: true }, () => {})

    expect(result.outputPath).toContain('-overlay.mov')
    expect(compositeVideo).not.toHaveBeenCalled()
  })

  it('passes outputResolution to compositeVideo when provided', async () => {
    await renderSession({ ...baseOpts, outputResolution: { width: 3840, height: 2160 } }, () => {})

    expect(compositeVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '/output.mp4',
      expect.objectContaining({
        outputWidth: 3840,
        outputHeight: 2160,
      }),
      expect.any(Function),
    )
  })

  it('passes onDiagnostic callback through', async () => {
    const diagnosticFn = vi.fn()
    await renderSession(baseOpts, () => {}, diagnosticFn)

    expect(compositeVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '/output.mp4',
      expect.objectContaining({
        onDiagnostic: diagnosticFn,
      }),
      expect.any(Function),
    )
  })

  it('validates config boxPosition', async () => {
    vi.mocked(loadTimingConfig).mockResolvedValueOnce({
      segments: [{ source: 'alphaTiming', mode: 'race', offset: '0:00', url: '', driver: '' }],
      configBoxPosition: 'invalid-position',
      configTablePosition: undefined,
      overlayComponents: undefined,
      styling: undefined,
    } as any)

    await expect(renderSession(baseOpts, () => {})).rejects.toThrow('config.boxPosition must be one of')
  })

  it('validates config qualifyingTablePosition', async () => {
    vi.mocked(loadTimingConfig).mockResolvedValueOnce({
      segments: [{ source: 'alphaTiming', mode: 'race', offset: '0:00', url: '', driver: '' }],
      configBoxPosition: undefined,
      configTablePosition: 'invalid-corner',
      overlayComponents: undefined,
      styling: undefined,
    } as any)

    await expect(renderSession(baseOpts, () => {})).rejects.toThrow('config.qualifyingTablePosition must be one of')
  })

  it('uses default bottom-center box position for modern style', async () => {
    await renderSession(baseOpts, () => {})

    expect(renderOverlay).toHaveBeenCalledWith(
      expect.any(String),
      'modern',
      expect.objectContaining({ boxPosition: 'bottom-center' }),
      expect.any(String),
      expect.any(Function),
    )
  })

  it('uses bottom-left for non-modern styles', async () => {
    await renderSession({ ...baseOpts, style: 'esports' }, () => {})

    expect(renderOverlay).toHaveBeenCalledWith(
      expect.any(String),
      'esports',
      expect.objectContaining({ boxPosition: 'bottom-left' }),
      expect.any(String),
      expect.any(Function),
    )
  })

  it('computes overlayY from strip heights for esports style', async () => {
    await renderSession({ ...baseOpts, style: 'esports' }, () => {})

    // strip height for esports is 400, scaled to 1920px width = 400
    // bottom-left: overlayY = 1080 - 400 = 680
    expect(compositeVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '/output.mp4',
      expect.objectContaining({ overlayY: 680 }),
      expect.any(Function),
    )
  })

  it('passes explicit overlayX and overlayY', async () => {
    await renderSession({ ...baseOpts, overlayX: 100, overlayY: 200 }, () => {})

    expect(compositeVideo).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      '/output.mp4',
      expect.objectContaining({ overlayX: 100, overlayY: 200 }),
      expect.any(Function),
    )
  })

  it('cleans up temp joined video even on error', async () => {
    vi.mocked(compositorJoinVideos).mockResolvedValueOnce(undefined)
    vi.mocked(resolveTimingSegments).mockRejectedValueOnce(new Error('timing error'))

    await expect(renderSession({ ...baseOpts, videoPaths: ['/a.mp4', '/b.mp4'] }, () => {})).rejects.toThrow(
      'timing error',
    )

    expect(unlink).toHaveBeenCalled()
  })
})
