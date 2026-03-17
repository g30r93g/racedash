import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as childProcess from 'node:child_process'

// We test the handler logic in isolation by importing the exported helper.
import { checkFfmpegImpl } from '../ipc'

vi.mock('node:child_process')

describe('checkFfmpegImpl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns found=true with path when ffmpeg is on PATH', () => {
    vi.spyOn(childProcess, 'execSync').mockReturnValue(
      Buffer.from('/usr/local/bin/ffmpeg\n')
    )
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: true, path: '/usr/local/bin/ffmpeg' })
    expect(childProcess.execSync).toHaveBeenCalledWith('which ffmpeg')
  })

  it('returns found=false when ffmpeg is not on PATH', () => {
    vi.spyOn(childProcess, 'execSync').mockImplementation(() => {
      throw new Error('not found')
    })
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: false })
  })

  it('trims whitespace from the path', () => {
    vi.spyOn(childProcess, 'execSync').mockReturnValue(
      Buffer.from('  /opt/homebrew/bin/ffmpeg  \n')
    )
    const result = checkFfmpegImpl()
    expect(result).toEqual({ found: true, path: '/opt/homebrew/bin/ffmpeg' })
  })
})
