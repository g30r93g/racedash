import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    setName: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
    on: vi.fn(),
    isPackaged: false,
    getAppPath: vi.fn().mockReturnValue('/app'),
    dock: { setIcon: vi.fn() },
  },
  BrowserWindow: vi.fn(),
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
  },
}))

vi.mock('../ffmpeg', () => ({ configureBundledFfmpegPath: vi.fn() }))
vi.mock('../ipc', () => ({ registerIpcHandlers: vi.fn() }))
vi.mock('../updater', () => ({ registerUpdaterHandlers: vi.fn() }))

describe('cleanupEmptyRacedashTempDirs', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('removes empty racedash temp directories only', async () => {
    const readdir = vi.fn(async (targetPath: string) => {
      if (targetPath === '/tmp') return ['racedash-config-empty', 'racedash-config-full', 'other-dir', 'racedash-file']
      if (targetPath === '/tmp/racedash-config-empty') return []
      if (targetPath === '/tmp/racedash-config-full') return ['config.json']
      throw new Error(`Unexpected readdir path: ${targetPath}`)
    })
    const lstat = vi.fn(async (targetPath: string) => ({
      isDirectory: () => targetPath !== '/tmp/racedash-file',
    }))
    const rmdir = vi.fn().mockResolvedValue(undefined)

    vi.doMock('node:fs', () => ({
      default: {
        promises: { readdir, lstat, rmdir },
        existsSync: vi.fn().mockReturnValue(false),
      },
    }))

    const { cleanupEmptyRacedashTempDirs } = await import('../index')
    await cleanupEmptyRacedashTempDirs('/tmp')

    expect(rmdir).toHaveBeenCalledTimes(1)
    expect(rmdir).toHaveBeenCalledWith('/tmp/racedash-config-empty')
  })

  it('returns when the temp root cannot be listed', async () => {
    const readdir = vi.fn().mockRejectedValue(new Error('ENOENT'))

    vi.doMock('node:fs', () => ({
      default: {
        promises: { readdir, lstat: vi.fn(), rmdir: vi.fn() },
        existsSync: vi.fn().mockReturnValue(false),
      },
    }))

    const { cleanupEmptyRacedashTempDirs } = await import('../index')
    await expect(cleanupEmptyRacedashTempDirs('/tmp')).resolves.toBeUndefined()
  })
})
