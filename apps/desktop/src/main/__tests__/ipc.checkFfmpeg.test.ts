import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as childProcess from 'node:child_process'

vi.mock('../ffmpeg', () => ({
  getBundledToolPath: vi.fn(() => null),
  resolveFfprobeCommand: vi.fn(() => 'ffprobe'),
}))
vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(),
  listDrivers: vi.fn(),
  generateTimestamps: vi.fn(),
  renderSession: vi.fn(),
  parseFpsValue: vi.fn(),
  buildRaceLapSnapshots: vi.fn(),
  buildSessionSegments: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}))

// We test the handler logic in isolation by importing the exported helper.
import { checkFfmpegImpl } from '../ipc'
import { getBundledToolPath } from '../ffmpeg'

const mockGetBundledToolPath = vi.mocked(getBundledToolPath)

describe('checkFfmpegImpl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetBundledToolPath.mockReturnValue(null)
  })

  it('returns the bundled ffmpeg path when the packaged app ships one', () => {
    mockGetBundledToolPath.mockReturnValue('/Applications/RaceDash.app/Contents/Resources/ffmpeg/ffmpeg')
    const result = checkFfmpegImpl()
    expect(result).toEqual({
      found: true,
      path: '/Applications/RaceDash.app/Contents/Resources/ffmpeg/ffmpeg',
    })
    expect(childProcess.execFileSync).not.toHaveBeenCalled()
  })

  it('returns found=true with path when ffmpeg is on PATH', () => {
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue(Buffer.from('/usr/local/bin/ffmpeg\n'))
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: true, path: '/usr/local/bin/ffmpeg' })
    expect(childProcess.execFileSync).toHaveBeenCalledWith(process.platform === 'win32' ? 'where.exe' : 'which', [
      'ffmpeg',
    ])
  })

  it('returns found=false when ffmpeg is not on PATH', () => {
    vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw new Error('not found')
    })
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: false })
  })

  it('trims whitespace from the path', () => {
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue(Buffer.from('  /opt/homebrew/bin/ffmpeg  \n'))
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: true, path: '/opt/homebrew/bin/ffmpeg' })
  })

  it('uses the first path when the lookup command returns multiple matches', () => {
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue(
      Buffer.from('C:\\ffmpeg\\bin\\ffmpeg.exe\r\nD:\\backup\\ffmpeg.exe\r\n'),
    )
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: true, path: 'C:\\ffmpeg\\bin\\ffmpeg.exe' })
  })
})
