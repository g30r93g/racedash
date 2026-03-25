import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      rm: vi.fn().mockResolvedValue(undefined),
    },
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
  promises: {
    readFile: vi.fn(),
    rm: vi.fn().mockResolvedValue(undefined),
  },
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

// Mock projectRegistry so tests control what paths are registered.
vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn(),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
  _resetQueueForTesting: vi.fn(),
}))

import fs from 'node:fs'
import * as registry from '../projectRegistry'
import { listProjectsHandler, openProjectHandler, deleteProjectHandler } from '../ipc'

const mockGetRegistry = vi.mocked(registry.getRegistry)
const mockReadFile = vi.mocked(fs.promises.readFile)
const mockRm = vi.mocked(fs.promises.rm)
const mockRemoveFromRegistry = vi.mocked(registry.removeFromRegistry)

const PROJECT_PATH = '/custom/my-race/project.json'
const SAMPLE_PROJECT = {
  name: 'My Race',
  projectPath: PROJECT_PATH,
  configPath: '/custom/my-race/config.json',
  videoPaths: ['/custom/my-race/video.mp4'],
  segments: [],
  selectedDrivers: {},
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listProjectsHandler', () => {
  it('returns [] when the registry is empty', async () => {
    mockGetRegistry.mockResolvedValue([])
    expect(await listProjectsHandler()).toEqual([])
  })

  it('returns a parsed project when project.json exists and is valid', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)

    const result = await listProjectsHandler()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: 'My Race', projectPath: PROJECT_PATH })
    expect(result[0].missing).toBeUndefined()
  })

  it('returns a missing entry when project.json does not exist', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await listProjectsHandler()

    expect(result).toHaveLength(1)
    expect(result[0].missing).toBe(true)
    expect(result[0].projectPath).toBe(PROJECT_PATH)
    expect(result[0].name).toBe('my-race') // parent dir name
  })

  it('silently omits entries where project.json is corrupt JSON', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue('NOT VALID JSON' as unknown as Buffer)

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('silently omits entries where project.json lacks a name field', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue(
      JSON.stringify({ projectPath: PROJECT_PATH }) as unknown as Buffer,
    )

    const result = await listProjectsHandler()

    expect(result).toEqual([])
  })

  it('strips a runtime missing field from a successfully parsed file', async () => {
    mockGetRegistry.mockResolvedValue([PROJECT_PATH])
    mockReadFile.mockResolvedValue(
      JSON.stringify({ ...SAMPLE_PROJECT, missing: true }) as unknown as Buffer,
    )

    const result = await listProjectsHandler()

    expect(result[0].missing).toBeUndefined()
  })

  it('handles multiple paths, mixing valid and missing', async () => {
    const path2 = '/other/race/project.json'
    mockGetRegistry.mockResolvedValue([PROJECT_PATH, path2])
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const result = await listProjectsHandler()

    expect(result).toHaveLength(2)
    expect(result[0].missing).toBeUndefined()
    expect(result[1].missing).toBe(true)
  })
})

describe('deleteProjectHandler', () => {
  it('removes from registry then deletes the folder', async () => {
    mockRemoveFromRegistry.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)

    await deleteProjectHandler(PROJECT_PATH)

    expect(mockRemoveFromRegistry).toHaveBeenCalledWith(PROJECT_PATH)
    expect(mockRm).toHaveBeenCalledWith(path.dirname(PROJECT_PATH), { recursive: true, force: true })
  })

  it('proceeds with folder delete even if path was not in registry (no-op remove)', async () => {
    mockRemoveFromRegistry.mockResolvedValue(undefined) // no-op — path was not found
    mockRm.mockResolvedValue(undefined)

    await deleteProjectHandler(PROJECT_PATH)

    expect(mockRm).toHaveBeenCalled()
  })

  it('aborts without touching the disk when removeFromRegistry throws an I/O error', async () => {
    mockRemoveFromRegistry.mockRejectedValue(new Error('disk error'))

    await expect(deleteProjectHandler(PROJECT_PATH)).rejects.toThrow('disk error')
    expect(mockRm).not.toHaveBeenCalled()
  })

  it('throws when projectPath is empty', async () => {
    await expect(deleteProjectHandler('')).rejects.toThrow('non-empty string')
  })

  it('throws when projectPath does not end with project.json', async () => {
    await expect(deleteProjectHandler('/etc/passwd')).rejects.toThrow('project.json')
  })
})

describe('openProjectHandler', () => {
  it('reads and returns parsed ProjectData from the given path', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)

    const result = await openProjectHandler(SAMPLE_PROJECT.projectPath)
    expect(result.name).toBe('My Race')
  })

  it('throws when projectPath is empty', async () => {
    await expect(openProjectHandler('')).rejects.toThrow('non-empty string')
    expect(vi.mocked(fs.readFileSync)).not.toHaveBeenCalled()
  })

  it('throws when projectPath does not end with project.json', async () => {
    await expect(openProjectHandler('/etc/passwd')).rejects.toThrow('project.json')
    expect(vi.mocked(fs.readFileSync)).not.toHaveBeenCalled()
  })
})
