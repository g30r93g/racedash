import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

const TMP = path.join('/', 'tmp')
const EMPTY_DIR = path.join(TMP, 'racedash-config-empty')
const FULL_DIR = path.join(TMP, 'racedash-config-full')
const FILE = path.join(TMP, 'racedash-file')

vi.mock('electron', () => ({
  app: {
    setName: vi.fn(),
    setAppUserModelId: vi.fn(),
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
      if (targetPath === TMP) return ['racedash-config-empty', 'racedash-config-full', 'other-dir', 'racedash-file']
      if (targetPath === EMPTY_DIR) return []
      if (targetPath === FULL_DIR) return ['config.json']
      throw new Error(`Unexpected readdir path: ${targetPath}`)
    })
    const lstat = vi.fn(async (targetPath: string) => ({
      isDirectory: () => targetPath !== FILE,
    }))
    const rmdir = vi.fn().mockResolvedValue(undefined)

    vi.doMock('node:fs', () => ({
      default: {
        promises: { readdir, lstat, rmdir },
        existsSync: vi.fn().mockReturnValue(false),
      },
    }))

    const { cleanupEmptyRacedashTempDirs } = await import('../index')
    await cleanupEmptyRacedashTempDirs(TMP)

    expect(rmdir).toHaveBeenCalledTimes(1)
    expect(rmdir).toHaveBeenCalledWith(EMPTY_DIR)
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
    await expect(cleanupEmptyRacedashTempDirs(TMP)).resolves.toBeUndefined()
  })
})
