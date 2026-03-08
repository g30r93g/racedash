import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { joinVideos } from './index'

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], callback: Function) => {
    callback(null, { stdout: '', stderr: '' })
  }),
}))

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
    const mockExecFile = vi.mocked(execFile)
    let tmpFilePath: string | undefined
    mockExecFile.mockImplementationOnce((_cmd, args, callback) => {
      const iIdx = (args as string[]).indexOf('-i')
      tmpFilePath = (args as string[])[iIdx + 1]
      ;(callback as Function)(null, { stdout: '', stderr: '' })
    })
    await joinVideos(['/clip1.mp4', '/clip2.mp4'], '/out.mp4')
    expect(tmpFilePath).toBeDefined()
    const content = await fs.readFile(tmpFilePath!, 'utf-8')
    expect(content).toContain("file '/clip1.mp4'")
    expect(content).toContain("file '/clip2.mp4'")
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
    await expect(fs.access(tmpFilePath!)).rejects.toThrow()
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
    await expect(fs.access(tmpFilePath!)).rejects.toThrow()
  })
})
