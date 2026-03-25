import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn(),
}))

vi.mock('../api-client', () => ({
  fetchWithAuth: vi.fn(),
}))

vi.mock('../license-cache', () => ({
  cacheLicense: vi.fn(),
  loadCachedLicense: vi.fn(),
}))

import { ipcMain } from 'electron'
import { registerLicenseHandlers } from '../license-handlers'
import { fetchWithAuth } from '../api-client'
import { cacheLicense, loadCachedLicense } from '../license-cache'

describe('registerLicenseHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => any>()

  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      handlers.set(channel, handler)
      return undefined as any
    })
    registerLicenseHandlers({} as any)
  })

  it('registers all license/credit handlers', () => {
    expect(handlers.has('racedash:license:get')).toBe(true)
    expect(handlers.has('racedash:license:getCached')).toBe(true)
    expect(handlers.has('racedash:credits:getBalance')).toBe(true)
    expect(handlers.has('racedash:credits:getHistory')).toBe(true)
  })

  it('license:get fetches and caches license', async () => {
    const license = { tier: 'pro', status: 'active' }
    vi.mocked(fetchWithAuth).mockResolvedValueOnce({ license })

    const result = await handlers.get('racedash:license:get')!()
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/license')
    expect(cacheLicense).toHaveBeenCalledWith(license)
    expect(result).toEqual(license)
  })

  it('license:getCached returns cached license', async () => {
    const license = { tier: 'pro', status: 'active' }
    vi.mocked(loadCachedLicense).mockReturnValue(license as any)

    const result = await handlers.get('racedash:license:getCached')!()
    expect(result).toEqual(license)
  })

  it('credits:getBalance fetches balance', async () => {
    const balance = { available: 100, total: 200 }
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(balance)

    const result = await handlers.get('racedash:credits:getBalance')!()
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/credits/balance')
    expect(result).toEqual(balance)
  })

  it('credits:getHistory fetches with cursor', async () => {
    const history = { items: [], nextCursor: null }
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(history)

    await handlers.get('racedash:credits:getHistory')!({}, 'abc123')
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/credits/history?cursor=abc123')
  })

  it('credits:getHistory fetches without cursor', async () => {
    const history = { items: [], nextCursor: null }
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(history)

    await handlers.get('racedash:credits:getHistory')!({})
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/credits/history')
  })
})
