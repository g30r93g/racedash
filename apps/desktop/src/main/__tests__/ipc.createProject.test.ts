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
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

import fs from 'node:fs'
import { handleCreateProject } from '../ipc'

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

  it('copies the joined video into <saveDir>/video.mp4', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(vi.mocked(fs.promises.copyFile)).toHaveBeenCalledWith(
      baseOpts.joinedVideoPath,
      path.join(expectedDir, 'video.mp4')
    )
  })

  it('deletes the joined video if it is a temp file (in os.tmpdir())', async () => {
    await handleCreateProject(baseOpts)
    expect(vi.mocked(fs.promises.unlink)).toHaveBeenCalledWith(baseOpts.joinedVideoPath)
  })

  it('does not delete the joined video if it is not a temp file', async () => {
    const opts = { ...baseOpts, joinedVideoPath: '/Users/testuser/Videos/chapter1.mp4' }
    await handleCreateProject(opts)
    expect(vi.mocked(fs.promises.unlink)).not.toHaveBeenCalled()
  })

  it('writes project.json with videoPaths pointing to the copied video', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[1][1] as string
    const written = JSON.parse(writtenJson)
    expect(written.videoPaths).toEqual([path.join(expectedDir, 'video.mp4')])
  })

  it('writes project.json with correct fields', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[1][1] as string
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
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[1][1] as string
    const written = JSON.parse(writtenJson)
    expect(written.segments[0].videoOffsetFrame).toBe(150)
    expect(written.segments[0].eventId).toBe('12345')
  })
})
