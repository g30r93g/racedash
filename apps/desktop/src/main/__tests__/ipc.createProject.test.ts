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
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn(),
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
const mockWriteFileSync = vi.mocked(fs.writeFileSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleCreateProject', () => {
  const baseOpts = {
    name: 'My Race',
    videoPaths: ['/videos/clip1.mp4', '/videos/clip2.mp4'],
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

  it('writes project.json inside the save directory', async () => {
    await handleCreateProject(baseOpts)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    const expectedPath = path.join(expectedDir, 'project.json')
    expect(mockWriteFileSync).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf-8')
  })

  it('writes project.json with correct ProjectData content', async () => {
    await handleCreateProject(baseOpts)
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string
    const written = JSON.parse(writtenJson)
    const expectedDir = path.join(os.homedir(), 'Videos', 'racedash', 'my-race')
    expect(written).toMatchObject({
      name: 'My Race',
      projectPath: path.join(expectedDir, 'project.json'),
      videoPaths: baseOpts.videoPaths,
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
      expect.stringContaining('club-endurance'),
      { recursive: true }
    )
  })

  it('preserves all segment fields in project.json', async () => {
    const optsWithOffset = {
      ...baseOpts,
      segments: [{ label: 'Race', source: 'mylapsSpeedhive' as const, eventId: '12345', session: 'race' as const, videoOffsetFrame: 150 }],
    }
    await handleCreateProject(optsWithOffset)
    const writtenJson = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string
    const written = JSON.parse(writtenJson)
    expect(written.segments[0].videoOffsetFrame).toBe(150)
    expect(written.segments[0].eventId).toBe('12345')
  })
})
