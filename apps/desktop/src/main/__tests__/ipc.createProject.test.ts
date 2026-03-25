import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    promises: {
      copyFile: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  promises: {
    copyFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@racedash/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@racedash/engine')>()
  return {
    ...actual,
    loadTimingConfig: vi.fn().mockResolvedValue({ segments: [{}] }),
    resolveTimingSegments: vi.fn().mockResolvedValue([{ drivers: [], capabilities: {}, startingGrid: [], replayData: [] }]),
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn().mockResolvedValue([]),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
  _resetQueueForTesting: vi.fn(),
}))

import fs from 'node:fs'
import { handleCreateProject } from '../ipc'
import * as registry from '../projectRegistry'
const mockAddToRegistry = vi.mocked(registry.addToRegistry)

const mockMkdirSync = vi.mocked(fs.mkdirSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleCreateProject', () => {
  const baseOpts = {
    name: 'My Race',
    // Use path.join(os.tmpdir(), ...) so the path matches on macOS where
    // os.tmpdir() returns /private/tmp (symlink to /tmp).
    joinedVideoPath: path.join(os.tmpdir(), 'racedash-join-123.mp4'),
    segments: [
      {
        label: 'Race',
        source: 'mylapsSpeedhive' as const,
        eventId: '12345',
        session: 'race' as const,
      },
    ],
    selectedDriver: 'G. Gorzynski',
  }

  it('creates the project directory under ~/Videos/racedash/<slug>', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(mockMkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true })
  })

  it('moves a temp joined video into <saveDir>/video.mp4', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(vi.mocked(fs.promises.rename)).toHaveBeenCalledWith(
      baseOpts.joinedVideoPath,
      path.join(expectedDir, 'video.mp4')
    )
    expect(vi.mocked(fs.promises.copyFile)).not.toHaveBeenCalled()
  })

  it('does not separately delete the joined video after a successful temp-file move', async () => {
    await handleCreateProject(baseOpts)
    expect(vi.mocked(fs.promises.unlink)).not.toHaveBeenCalledWith(baseOpts.joinedVideoPath)
  })

  it('copies a non-temp source video into <saveDir>/video.mp4', async () => {
    const opts = { ...baseOpts, joinedVideoPath: '/Users/testuser/Videos/chapter1.mp4' }
    await handleCreateProject(opts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(vi.mocked(fs.promises.copyFile)).toHaveBeenCalledWith(
      opts.joinedVideoPath,
      path.join(expectedDir, 'video.mp4')
    )
    expect(vi.mocked(fs.promises.rename)).not.toHaveBeenCalled()
  })

  it('falls back to copy and delete when moving a temp joined video across devices', async () => {
    vi.mocked(fs.promises.rename).mockRejectedValueOnce(Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }))

    await handleCreateProject(baseOpts)

    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(vi.mocked(fs.promises.copyFile)).toHaveBeenCalledWith(
      baseOpts.joinedVideoPath,
      path.join(expectedDir, 'video.mp4')
    )
    expect(vi.mocked(fs.promises.unlink)).toHaveBeenCalledWith(baseOpts.joinedVideoPath)
  })

  it('writes project.json with videoPaths pointing to the copied video', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    // writeFileSync calls: [0] temp cache file, [1] config.json, [2] project.json
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[2][1] as string
    const written = JSON.parse(writtenJson)
    expect(written.videoPaths).toEqual([path.join(expectedDir, 'video.mp4')])
  })

  it('writes project.json with correct fields', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    // writeFileSync calls: [0] temp cache file, [1] config.json, [2] project.json
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[2][1] as string
    const written = JSON.parse(writtenJson)
    expect(written).toMatchObject({
      name: 'My Race',
      projectPath: path.join(expectedDir, 'project.json'),
      selectedDriver: 'G. Gorzynski',
    })
    expect(written.segments).toHaveLength(1)
    expect(written.segments[0].label).toBe('Race')
  })

  it('returns ProjectData with projectPath set to the new project.json path', async () => {
    const result = await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(result.projectPath).toBe(path.join(expectedDir, 'project.json'))
    expect(result.name).toBe('My Race')
    expect(result.selectedDriver).toBe('G. Gorzynski')
  })

  it('slugifies project names with spaces and special characters', async () => {
    await handleCreateProject({ ...baseOpts, name: 'Club Endurance — Round 3!' })
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('club-endurance-round-3'),
      { recursive: true }
    )
  })

  it('preserves all segment fields in project.json', async () => {
    const opts = {
      ...baseOpts,
      segments: [{ label: 'Race', source: 'mylapsSpeedhive' as const, eventId: '12345', session: 'race' as const, videoOffsetFrame: 150 }],
    }
    await handleCreateProject(opts)
    // writeFileSync calls: [0] temp cache file, [1] config.json, [2] project.json
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[2][1] as string
    const written = JSON.parse(writtenJson)
    expect(written.segments[0].videoOffsetFrame).toBe(150)
    expect(written.segments[0].eventId).toBe('12345')
  })

  it('registers the new project path in the registry', async () => {
    await handleCreateProject(baseOpts)
    expect(mockAddToRegistry).toHaveBeenCalledWith(
      expect.stringContaining('project.json'),
    )
  })

  it('rejects when saveDir exists and is not empty', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce(['old-file.txt'] as unknown as ReturnType<typeof fs.readdirSync>)

    await expect(handleCreateProject(baseOpts)).rejects.toThrow('Save directory is not empty')
    expect(mockMkdirSync).not.toHaveBeenCalled()
  })

  it('allows saving when saveDir exists but is empty', async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true)
    vi.mocked(fs.readdirSync).mockReturnValueOnce([] as unknown as ReturnType<typeof fs.readdirSync>)

    await handleCreateProject(baseOpts)
    expect(mockMkdirSync).toHaveBeenCalled()
  })

  it('rolls back written files when addToRegistry fails', async () => {
    mockAddToRegistry.mockRejectedValueOnce(new Error('disk full'))

    await expect(handleCreateProject(baseOpts)).rejects.toThrow('disk full')

    expect(vi.mocked(fs.promises).unlink).toHaveBeenCalledTimes(3)
    const expectedSaveDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(vi.mocked(fs.promises).unlink).toHaveBeenCalledWith(path.join(expectedSaveDir, 'project.json'))
    expect(vi.mocked(fs.promises).unlink).toHaveBeenCalledWith(path.join(expectedSaveDir, 'config.json'))
    expect(vi.mocked(fs.promises).unlink).toHaveBeenCalledWith(path.join(expectedSaveDir, 'video.mp4'))
  })
})
