import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'

const TMP = path.join('/', 'tmp')
const EMPTY_DIR = path.join(TMP, 'racedash-config-empty')
const FULL_DIR = path.join(TMP, 'racedash-config-full')
const STALE_MP4 = path.join(TMP, 'racedash-join-123.mp4')
const STALE_TXT = path.join(TMP, 'racedash-concat-abc.txt')
const FRESH_MP4 = path.join(TMP, 'racedash-joined-xyz.mp4')
const NON_RACEDASH = path.join(TMP, 'other-file.mp4')

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

const TWO_HOURS_AGO = Date.now() - 2 * 60 * 60 * 1000
const FIVE_MINUTES_AGO = Date.now() - 5 * 60 * 1000

describe('cleanupStaleTempFiles', () => {
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
      isDirectory: () => targetPath !== path.join(TMP, 'racedash-file'),
      mtimeMs: TWO_HOURS_AGO,
    }))
    const rmdir = vi.fn().mockResolvedValue(undefined)
    const unlink = vi.fn().mockResolvedValue(undefined)

    vi.doMock('node:fs', () => ({
      default: {
        promises: { readdir, lstat, rmdir, unlink },
        existsSync: vi.fn().mockReturnValue(false),
      },
    }))

    const { cleanupStaleTempFiles } = await import('../index')
    await cleanupStaleTempFiles(TMP)

    expect(rmdir).toHaveBeenCalledTimes(1)
    expect(rmdir).toHaveBeenCalledWith(EMPTY_DIR)
  })

  it('removes stale .mp4 and .txt files older than maxAge', async () => {
    const readdir = vi.fn(async (targetPath: string) => {
      if (targetPath === TMP)
        return ['racedash-join-123.mp4', 'racedash-concat-abc.txt', 'racedash-joined-xyz.mp4', 'other-file.mp4']
      return []
    })
    const lstat = vi.fn(async (targetPath: string) => ({
      isDirectory: () => false,
      mtimeMs: targetPath === FRESH_MP4 ? FIVE_MINUTES_AGO : TWO_HOURS_AGO,
    }))
    const rmdir = vi.fn().mockResolvedValue(undefined)
    const unlink = vi.fn().mockResolvedValue(undefined)

    vi.doMock('node:fs', () => ({
      default: {
        promises: { readdir, lstat, rmdir, unlink },
        existsSync: vi.fn().mockReturnValue(false),
      },
    }))

    const { cleanupStaleTempFiles } = await import('../index')
    await cleanupStaleTempFiles(TMP)

    // Should remove stale mp4 and txt, but NOT the fresh mp4 or non-racedash file
    expect(unlink).toHaveBeenCalledTimes(2)
    expect(unlink).toHaveBeenCalledWith(STALE_MP4)
    expect(unlink).toHaveBeenCalledWith(STALE_TXT)
    expect(unlink).not.toHaveBeenCalledWith(FRESH_MP4)
    expect(unlink).not.toHaveBeenCalledWith(NON_RACEDASH)
  })

  it('skips files with non-matching extensions', async () => {
    const readdir = vi.fn(async (targetPath: string) => {
      if (targetPath === TMP) return ['racedash-something.json', 'racedash-log.log']
      return []
    })
    const lstat = vi.fn(async () => ({
      isDirectory: () => false,
      mtimeMs: TWO_HOURS_AGO,
    }))
    const rmdir = vi.fn().mockResolvedValue(undefined)
    const unlink = vi.fn().mockResolvedValue(undefined)

    vi.doMock('node:fs', () => ({
      default: {
        promises: { readdir, lstat, rmdir, unlink },
        existsSync: vi.fn().mockReturnValue(false),
      },
    }))

    const { cleanupStaleTempFiles } = await import('../index')
    await cleanupStaleTempFiles(TMP)

    expect(unlink).not.toHaveBeenCalled()
  })

  it('returns when the temp root cannot be listed', async () => {
    const readdir = vi.fn().mockRejectedValue(new Error('ENOENT'))

    vi.doMock('node:fs', () => ({
      default: {
        promises: { readdir, lstat: vi.fn(), rmdir: vi.fn(), unlink: vi.fn() },
        existsSync: vi.fn().mockReturnValue(false),
      },
    }))

    const { cleanupStaleTempFiles } = await import('../index')
    await expect(cleanupStaleTempFiles(TMP)).resolves.toBeUndefined()
  })
})
