import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must mock electron before importing the module under test.
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
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  },
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

import fs from 'node:fs'
import {
  getRegistry,
  addToRegistry,
  removeFromRegistry,
  replaceInRegistry,
  _resetQueueForTesting,
} from '../projectRegistry'

const mockReadFile = vi.mocked(fs.promises.readFile)
const mockWriteFile = vi.mocked(fs.promises.writeFile)

const REGISTRY_PATH = '/Users/testuser/projects-registry.json'

beforeEach(() => {
  vi.clearAllMocks()
  _resetQueueForTesting()
})

describe('getRegistry', () => {
  it('returns [] when the registry file does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    expect(await getRegistry()).toEqual([])
  })

  it('returns [] when the registry file contains invalid JSON', async () => {
    mockReadFile.mockResolvedValue('NOT JSON' as unknown as Buffer)
    expect(await getRegistry()).toEqual([])
  })

  it('returns the parsed array when the file contains valid JSON', async () => {
    const paths = ['/a/project.json', '/b/project.json']
    mockReadFile.mockResolvedValue(JSON.stringify(paths) as unknown as Buffer)
    expect(await getRegistry()).toEqual(paths)
  })
})

describe('addToRegistry', () => {
  it('appends a new path and writes the file', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    await addToRegistry('/b/project.json')
    expect(mockWriteFile).toHaveBeenCalledWith(
      REGISTRY_PATH,
      JSON.stringify(['/a/project.json', '/b/project.json']),
      'utf-8',
    )
  })

  it('is a no-op when the path is already registered', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    await addToRegistry('/a/project.json')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})

describe('removeFromRegistry', () => {
  it('removes the path and writes the file', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json', '/b/project.json']) as unknown as Buffer)
    await removeFromRegistry('/a/project.json')
    expect(mockWriteFile).toHaveBeenCalledWith(REGISTRY_PATH, JSON.stringify(['/b/project.json']), 'utf-8')
  })

  it('is a no-op when the path is not in the registry', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    await removeFromRegistry('/nonexistent/project.json')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})

describe('replaceInRegistry', () => {
  it('replaces the old path with the new path in the same position', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json', '/b/project.json']) as unknown as Buffer)
    await replaceInRegistry('/a/project.json', '/c/project.json')
    expect(mockWriteFile).toHaveBeenCalledWith(
      REGISTRY_PATH,
      JSON.stringify(['/c/project.json', '/b/project.json']),
      'utf-8',
    )
  })

  it('throws with code NOT_FOUND when the old path is not in the registry', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify(['/a/project.json']) as unknown as Buffer)
    const err = await replaceInRegistry('/missing/project.json', '/c/project.json').catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as NodeJS.ErrnoException).code).toBe('NOT_FOUND')
  })
})
