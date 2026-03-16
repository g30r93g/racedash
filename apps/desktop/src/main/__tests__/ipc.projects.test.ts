import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

import { listProjectsHandler, openProjectHandler } from '../ipc'

const FAKE_HOME = '/Users/testuser'
const FAKE_RACEDASH_DIR = `${FAKE_HOME}/Videos/racedash`

const SAMPLE_PROJECT = {
  name: 'Test Race',
  projectPath: `${FAKE_RACEDASH_DIR}/test-race/project.json`,
  videoPaths: ['/path/to/video.mp4'],
  segments: [],
  selectedDriver: 'G. Gorzynski',
}

describe('listProjectsHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [] when the racedash directory does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('returns [] when the racedash directory exists but has no subdirectories', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readdirSync').mockReturnValue([] as unknown as fs.Dirent[])

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('returns a parsed ProjectData when a valid project.json is found', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return p === FAKE_RACEDASH_DIR || p === `${FAKE_RACEDASH_DIR}/test-race/project.json`
    })
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['test-race'] as unknown as fs.Dirent[])
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(SAMPLE_PROJECT))

    const result = await listProjectsHandler()

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(SAMPLE_PROJECT)
  })

  it('skips entries that fail to parse as JSON', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return p === FAKE_RACEDASH_DIR || p === `${FAKE_RACEDASH_DIR}/bad-project/project.json`
    })
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['bad-project'] as unknown as fs.Dirent[])
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats)
    vi.spyOn(fs, 'readFileSync').mockReturnValue('NOT VALID JSON')

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('skips entries that are files (not directories)', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['some-file.txt'] as unknown as fs.Dirent[])
    vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as unknown as fs.Stats)

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })
})

describe('openProjectHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reads and returns parsed ProjectData from the given path', async () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(SAMPLE_PROJECT))

    const result = await openProjectHandler(SAMPLE_PROJECT.projectPath)

    expect(result).toEqual(SAMPLE_PROJECT)
  })

  it('throws when the file does not exist', async () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    await expect(openProjectHandler('/nonexistent/project.json')).rejects.toThrow('ENOENT')
  })

  it('throws when the file contains invalid JSON', async () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not json')

    await expect(openProjectHandler('/some/project.json')).rejects.toThrow()
  })
})
