import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  BrowserWindow: {
    getFocusedWindow: vi.fn().mockReturnValue({ id: 1 }),
    getAllWindows: vi.fn().mockReturnValue([{ id: 1 }]),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {},
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
  },
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('../projectRegistry', () => ({
  getRegistry: vi.fn().mockResolvedValue(['/old/project.json']),
  addToRegistry: vi.fn().mockResolvedValue(undefined),
  removeFromRegistry: vi.fn().mockResolvedValue(undefined),
  replaceInRegistry: vi.fn().mockResolvedValue(undefined),
  _resetQueueForTesting: vi.fn(),
}))

import { dialog } from 'electron'
import fs from 'node:fs'
import * as registry from '../projectRegistry'
import { relocateProjectHandler } from '../ipc'

const mockShowOpenDialog = vi.mocked(dialog.showOpenDialog)
const mockReadFile = vi.mocked(fs.promises.readFile)
const mockGetRegistry = vi.mocked(registry.getRegistry)
const mockReplaceInRegistry = vi.mocked(registry.replaceInRegistry)
const mockAddToRegistry = vi.mocked(registry.addToRegistry)

const OLD_PATH = '/old/project.json'
const NEW_PATH = '/new/project.json'
const SAMPLE_PROJECT = {
  name: 'My Race',
  projectPath: NEW_PATH,
  configPath: '/new/config.json',
  videoPaths: ['/new/video.mp4'],
  segments: [],
  selectedDrivers: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRegistry.mockResolvedValue([OLD_PATH])
  mockReplaceInRegistry.mockResolvedValue(undefined)
  mockAddToRegistry.mockResolvedValue(undefined)
})

describe('relocateProjectHandler', () => {
  it('rejects with CANCELLED when the user cancels the dialog', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    const err = await relocateProjectHandler(OLD_PATH).catch((e) => e)
    expect((err as Error).message).toBe('CANCELLED')
  })

  it('rejects with a parse error when the selected file is not valid JSON', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue('NOT JSON' as unknown as Buffer)

    await expect(relocateProjectHandler(OLD_PATH)).rejects.toThrow()
  })

  it('rejects when the selected file lacks a name field', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify({ projectPath: NEW_PATH }) as unknown as Buffer)

    await expect(relocateProjectHandler(OLD_PATH)).rejects.toThrow()
  })

  it('rejects with ALREADY_REGISTERED when the new path is already in the registry under a different entry', async () => {
    const otherPath = '/other/project.json'
    mockGetRegistry.mockResolvedValue([OLD_PATH, otherPath])
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [otherPath] })
    mockReadFile.mockResolvedValue(JSON.stringify({ ...SAMPLE_PROJECT, projectPath: otherPath }) as unknown as Buffer)

    const err = await relocateProjectHandler(OLD_PATH).catch((e) => e)
    expect((err as Error).message).toBe('ALREADY_REGISTERED')
  })

  it('allows selecting the same path as oldProjectPath (file reappeared in place)', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [OLD_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify({ ...SAMPLE_PROJECT, projectPath: OLD_PATH }) as unknown as Buffer)
    mockReplaceInRegistry.mockResolvedValue(undefined)

    const result = await relocateProjectHandler(OLD_PATH)
    expect(result.projectPath).toBe(OLD_PATH)
    expect(result.missing).toBeUndefined()
  })

  it('calls replaceInRegistry with old and new paths and returns updated ProjectData', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)

    const result = await relocateProjectHandler(OLD_PATH)

    expect(mockReplaceInRegistry).toHaveBeenCalledWith(OLD_PATH, NEW_PATH)
    expect(result.projectPath).toBe(NEW_PATH)
    expect(result.missing).toBeUndefined()
  })

  it('falls back to addToRegistry when replaceInRegistry throws NOT_FOUND', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)
    mockReplaceInRegistry.mockRejectedValue(Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' }))

    const result = await relocateProjectHandler(OLD_PATH)

    expect(mockAddToRegistry).toHaveBeenCalledWith(NEW_PATH)
    expect(result.projectPath).toBe(NEW_PATH)
  })

  it('re-throws when replaceInRegistry throws a non-NOT_FOUND error', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_PROJECT) as unknown as Buffer)
    mockReplaceInRegistry.mockRejectedValue(new Error('I/O error'))

    await expect(relocateProjectHandler(OLD_PATH)).rejects.toThrow('I/O error')
  })

  it('strips the missing field from the returned ProjectData', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    mockReadFile.mockResolvedValue(JSON.stringify({ ...SAMPLE_PROJECT, missing: true }) as unknown as Buffer)

    const result = await relocateProjectHandler(OLD_PATH)
    expect(result.missing).toBeUndefined()
  })

  it('sets projectPath to newProjectPath unconditionally, overriding whatever is in the file', async () => {
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: [NEW_PATH] })
    // File contains a different projectPath
    mockReadFile.mockResolvedValue(
      JSON.stringify({ ...SAMPLE_PROJECT, projectPath: '/some/other/path/project.json' }) as unknown as Buffer,
    )

    const result = await relocateProjectHandler(OLD_PATH)
    expect(result.projectPath).toBe(NEW_PATH)
  })
})
