import { describe, it, expect, vi, beforeEach } from 'vitest'

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: fsMock,
  ...fsMock,
}))

vi.mock('electron', async () => {
  return {
    BrowserWindow: function () {
      return {
        loadURL: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        on: vi.fn(),
        webContents: {
          on: vi.fn(),
          send: vi.fn(),
          session: {
            cookies: {
              get: vi.fn().mockResolvedValue([]),
              remove: vi.fn().mockResolvedValue(undefined),
            },
          },
        },
      }
    },
    safeStorage: {
      encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
      decryptString: vi.fn((b: Buffer) => b.toString().replace('enc:', '')),
    },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    app: { getPath: vi.fn().mockReturnValue('/mock/userData') },
  }
})

import { ipcMain } from 'electron'
import { registerTokenHandlers, getSessionToken } from '../auth'

describe('registerTokenHandlers', () => {
  const handleHandlers = new Map<string, (...args: any[]) => any>()
  const onHandlers = new Map<string, (...args: any[]) => any>()

  beforeEach(() => {
    vi.clearAllMocks()
    handleHandlers.clear()
    onHandlers.clear()
    fsMock.existsSync.mockReturnValue(false)
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      handleHandlers.set(channel, handler)
      return undefined as any
    })
    vi.mocked(ipcMain.on).mockImplementation((channel: string, handler: any) => {
      onHandlers.set(channel, handler)
      return undefined as any
    })
    registerTokenHandlers({ webContents: { send: vi.fn() } } as any)
  })

  it('registers all token handlers', () => {
    expect(handleHandlers.has('racedash:auth:token:save:session')).toBe(true)
    expect(handleHandlers.has('racedash:auth:token:get')).toBe(true)
    expect(handleHandlers.has('racedash:auth:fetchWithAuth')).toBe(true)
    expect(onHandlers.has('racedash:auth:token:save:client')).toBe(true)
    expect(onHandlers.has('racedash:auth:token:clear')).toBe(true)
  })

  describe('token:save:session', () => {
    it('stores session token in memory', async () => {
      await handleHandlers.get('racedash:auth:token:save:session')!({}, 'session-jwt-123')
      expect(getSessionToken()).toBe('session-jwt-123')
    })
  })

  describe('token:save:client', () => {
    it('persists client token to disk (encrypted)', () => {
      onHandlers.get('racedash:auth:token:save:client')!({}, 'client-jwt-abc')
      expect(fsMock.writeFileSync).toHaveBeenCalled()
    })
  })

  describe('token:get', () => {
    it('returns null when no token file exists', () => {
      fsMock.existsSync.mockReturnValue(false)
      const result = handleHandlers.get('racedash:auth:token:get')!()
      expect(result).toBeNull()
    })

    it('returns decrypted token when file exists', () => {
      fsMock.existsSync.mockReturnValue(true)
      fsMock.readFileSync.mockReturnValue(Buffer.from('enc:client-jwt-abc'))
      const result = handleHandlers.get('racedash:auth:token:get')!()
      expect(result).toBe('client-jwt-abc')
    })
  })

  describe('token:clear', () => {
    it('clears in-memory session token and deletes file when it exists', async () => {
      await handleHandlers.get('racedash:auth:token:save:session')!({}, 'some-token')
      expect(getSessionToken()).toBe('some-token')

      fsMock.existsSync.mockReturnValue(true)
      onHandlers.get('racedash:auth:token:clear')!()
      expect(getSessionToken()).toBeNull()
      expect(fsMock.unlinkSync).toHaveBeenCalled()
    })
  })

  describe('fetchWithAuth', () => {
    const mockFetch = vi.fn()

    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch)
    })

    it('fetches with session token when one is set', async () => {
      await handleHandlers.get('racedash:auth:token:save:session')!({}, 'bearer-token-xyz')

      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: { forEach: vi.fn() },
        text: async () => '{"ok":true}',
      })

      const result = await handleHandlers.get('racedash:auth:fetchWithAuth')!({}, '/api/test')
      expect(result.status).toBe(200)
      expect(result.body).toBe('{"ok":true}')
      // Verify the Authorization header was passed regardless of how the URL was constructed
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer bearer-token-xyz' }),
        }),
      )
    })

    it('fetches without Authorization header when no session token', async () => {
      onHandlers.get('racedash:auth:token:clear')!()

      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: { forEach: vi.fn() },
        text: async () => 'Unauthorized',
      })

      const result = await handleHandlers.get('racedash:auth:fetchWithAuth')!({}, '/api/test')
      expect(result.status).toBe(401)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.objectContaining({
          headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
        }),
      )
    })
  })
})
