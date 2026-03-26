import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// Track handlers registered via ipcMain.handle
const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
  BrowserWindow: vi.fn(),
}))

vi.mock('./auth-helpers', () => ({
  loadSessionToken: vi.fn(() => 'test-token'),
}))

function loadModule() {
  return import('./youtube')
}

describe('youtube handlers', () => {
  beforeEach(() => {
    handlers.clear()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  describe('when VITE_API_URL is not set', () => {
    beforeEach(async () => {
      delete process.env.VITE_API_URL
      const mod = await loadModule()
      mod.registerYouTubeHandlers({} as any)
    })

    it('getStatus returns disconnected without making a request', async () => {
      const handler = handlers.get('racedash:youtube:getStatus')!
      const result = await handler()
      expect(result).toEqual({ connected: false, account: null })
    })

    it('getUploads returns empty array without making a request', async () => {
      const handler = handlers.get('racedash:youtube:getUploads')!
      const result = await handler({}, 'some-job-id')
      expect(result).toEqual([])
    })

    it('connect throws a configuration error', async () => {
      const handler = handlers.get('racedash:youtube:connect')!
      await expect(handler()).rejects.toThrow('API server is not configured')
    })

    it('disconnect throws a configuration error', async () => {
      const handler = handlers.get('racedash:youtube:disconnect')!
      await expect(handler()).rejects.toThrow('API server is not configured')
    })

    it('upload throws a configuration error for valid jobId', async () => {
      const handler = handlers.get('racedash:youtube:upload')!
      await expect(
        handler({}, '12345678-1234-1234-1234-123456789abc', { title: 'test' })
      ).rejects.toThrow('API server is not configured')
    })
  })

  describe('when VITE_API_URL is set', () => {
    let fetchSpy: Mock

    beforeEach(async () => {
      process.env.VITE_API_URL = 'https://api.example.com'
      fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      const mod = await loadModule()
      mod.registerYouTubeHandlers({} as any)
    })

    it('getStatus fetches from the configured API URL', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ connected: true, account: { name: 'Test' } }),
      })

      const handler = handlers.get('racedash:youtube:getStatus')!
      const result = await handler()

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/youtube/status',
        expect.objectContaining({ method: 'GET' })
      )
      expect(result).toEqual({ connected: true, account: { name: 'Test' } })
    })

    it('getStatus returns disconnected on non-ok response', async () => {
      fetchSpy.mockResolvedValue({ ok: false })

      const handler = handlers.get('racedash:youtube:getStatus')!
      const result = await handler()

      expect(result).toEqual({ connected: false, account: null })
    })

    it('getUploads fetches from the configured API URL', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ uploads: [{ id: '1', status: 'complete' }] }),
      })

      const handler = handlers.get('racedash:youtube:getUploads')!
      const result = await handler({}, '12345678-1234-1234-1234-123456789abc')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/jobs/12345678-1234-1234-1234-123456789abc/social-uploads',
        expect.objectContaining({ method: 'GET' })
      )
      expect(result).toEqual([{ id: '1', status: 'complete' }])
    })

    it('includes authorization header from session token', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ connected: false, account: null }),
      })

      const handler = handlers.get('racedash:youtube:getStatus')!
      await handler()

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
    })

    it('upload rejects invalid jobId format', async () => {
      const handler = handlers.get('racedash:youtube:upload')!
      await expect(
        handler({}, 'not-a-uuid', { title: 'test' })
      ).rejects.toThrow('Invalid job ID format')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('upload sends POST request and returns result', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ socialUploadId: 'su-1', status: 'queued', rcCost: 5 }),
      })

      const handler = handlers.get('racedash:youtube:upload')!
      const result = await handler({}, '12345678-1234-1234-1234-123456789abc', { title: 'My Video' })

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/jobs/12345678-1234-1234-1234-123456789abc/social-upload',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result).toEqual({ socialUploadId: 'su-1', status: 'queued', rcCost: 5 })
    })

    it('upload throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'INVALID', message: 'Bad request' } }),
      })

      const handler = handlers.get('racedash:youtube:upload')!
      await expect(
        handler({}, '12345678-1234-1234-1234-123456789abc', { title: 'test' }),
      ).rejects.toThrow('Bad request')
    })

    it('disconnect calls DELETE on the API', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true })

      const handler = handlers.get('racedash:youtube:disconnect')!
      await handler()

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/youtube/disconnect',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    // NOTE: connect flow with BrowserWindow OAuth requires Electron runtime.
    // The connect handler's window lifecycle is tested in integration tests.

    it('connect throws when API returns error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'License required' } }),
      })

      const handler = handlers.get('racedash:youtube:connect')!
      await expect(handler()).rejects.toThrow('License required')
    })

    it('getUploads returns empty on non-ok response', async () => {
      fetchSpy.mockResolvedValue({ ok: false })

      const handler = handlers.get('racedash:youtube:getUploads')!
      const result = await handler({}, 'some-job-id')
      expect(result).toEqual([])
    })
  })
})
