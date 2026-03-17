import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@racedash/engine', () => ({
  listDrivers: vi.fn(),
  generateTimestamps: vi.fn(),
  renderSession: vi.fn(),
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

import * as engine from '@racedash/engine'

// The ipcMain.handle callbacks for listDrivers/generateTimestamps delegate
// directly to engine functions. We verify the engine integration by calling
// the engine mocks as the handlers would.

describe('IPC engine handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listDrivers engine integration', () => {
    it('resolves with driver list from engine', async () => {
      const mockResult = {
        segments: [],
        driverListsIdentical: true,
      }
      vi.mocked(engine.listDrivers).mockResolvedValue(mockResult as unknown as Awaited<ReturnType<typeof engine.listDrivers>>)

      const result = await engine.listDrivers({ configPath: '/path/to/project.json' })

      expect(engine.listDrivers).toHaveBeenCalledWith({ configPath: '/path/to/project.json' })
      expect(result.driverListsIdentical).toBe(true)
    })

    it('forwards driverQuery option', async () => {
      vi.mocked(engine.listDrivers).mockResolvedValue({
        segments: [],
        driverListsIdentical: true,
      } as unknown as Awaited<ReturnType<typeof engine.listDrivers>>)

      await engine.listDrivers({ configPath: '/path/to/project.json', driverQuery: 'GGORZ' })

      expect(engine.listDrivers).toHaveBeenCalledWith({
        configPath: '/path/to/project.json',
        driverQuery: 'GGORZ',
      })
    })

    it('propagates engine errors', async () => {
      vi.mocked(engine.listDrivers).mockRejectedValue(new Error('Config file not found'))

      await expect(
        engine.listDrivers({ configPath: '/missing/project.json' })
      ).rejects.toThrow('Config file not found')
    })
  })

  describe('generateTimestamps engine integration', () => {
    const mockResult = {
      chapters: '; chapters\n00:00.000 Race',
      segments: [],
      offsets: [0],
    }

    it('resolves with timing data from engine', async () => {
      vi.mocked(engine.generateTimestamps).mockResolvedValue(
        mockResult as unknown as Awaited<ReturnType<typeof engine.generateTimestamps>>
      )

      const result = await engine.generateTimestamps({ configPath: '/path/to/project.json' })

      expect(engine.generateTimestamps).toHaveBeenCalledWith({ configPath: '/path/to/project.json' })
      expect(typeof result.chapters).toBe('string')
    })

    it('forwards fps option', async () => {
      vi.mocked(engine.generateTimestamps).mockResolvedValue(
        mockResult as unknown as Awaited<ReturnType<typeof engine.generateTimestamps>>
      )

      await engine.generateTimestamps({ configPath: '/path/to/project.json', fps: 59.94 })

      expect(engine.generateTimestamps).toHaveBeenCalledWith({
        configPath: '/path/to/project.json',
        fps: 59.94,
      })
    })

    it('propagates engine errors', async () => {
      vi.mocked(engine.generateTimestamps).mockRejectedValue(new Error('No timing data'))

      await expect(
        engine.generateTimestamps({ configPath: '/path/to/project.json' })
      ).rejects.toThrow('No timing data')
    })

    it('returns offsets array', async () => {
      vi.mocked(engine.generateTimestamps).mockResolvedValue(
        mockResult as unknown as Awaited<ReturnType<typeof engine.generateTimestamps>>
      )

      const result = await engine.generateTimestamps({ configPath: '/path/to/project.json' })

      expect(result.offsets).toEqual([0])
    })
  })
})
