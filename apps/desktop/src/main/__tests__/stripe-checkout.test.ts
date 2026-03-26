import { describe, it, expect, vi, beforeEach } from 'vitest'

let willNavigateCallback: ((event: any, url: string) => void) | undefined
let didNavigateCallback: ((event: any, url: string) => void) | undefined
let closedCallback: (() => void) | undefined

vi.mock('electron', async () => {
  return {
    BrowserWindow: function () {
      return {
        loadURL: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockImplementation(() => {
          closedCallback?.()
        }),
        on: vi.fn().mockImplementation((event: string, cb: any) => {
          if (event === 'closed') closedCallback = cb
        }),
        webContents: {
          on: vi.fn().mockImplementation((event: string, cb: any) => {
            if (event === 'will-navigate') willNavigateCallback = cb
            if (event === 'did-navigate') didNavigateCallback = cb
          }),
          send: vi.fn(),
          session: { cookies: { get: vi.fn().mockResolvedValue([]), remove: vi.fn() } },
        },
      }
    },
    ipcMain: { handle: vi.fn() },
    shell: { openExternal: vi.fn() },
  }
})

vi.mock('../api-client', () => ({
  fetchWithAuth: vi.fn(),
}))

vi.mock('../license-cache', () => ({
  cacheLicense: vi.fn(),
}))

import { ipcMain, shell } from 'electron'
import { registerStripeHandlers } from '../stripe-checkout'
import { fetchWithAuth } from '../api-client'
import { cacheLicense } from '../license-cache'

describe('registerStripeHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => any>()
  const mainWindow = {
    webContents: { send: vi.fn() },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    handlers.clear()
    willNavigateCallback = undefined
    didNavigateCallback = undefined
    closedCallback = undefined
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      handlers.set(channel, handler)
      return undefined as any
    })
    registerStripeHandlers(mainWindow)
  })

  it('registers all stripe handlers', () => {
    expect(handlers.has('racedash:stripe:subscriptionCheckout')).toBe(true)
    expect(handlers.has('racedash:stripe:creditCheckout')).toBe(true)
    expect(handlers.has('racedash:stripe:portal')).toBe(true)
  })

  describe('subscriptionCheckout', () => {
    it('fetches checkout URL and returns outcome on success', async () => {
      vi.mocked(fetchWithAuth)
        .mockResolvedValueOnce({ checkoutUrl: 'https://checkout.stripe.com/test', sessionId: 'cs_1' })
        .mockResolvedValueOnce({ license: { tier: 'pro', status: 'active' } })

      const promise = handlers.get('racedash:stripe:subscriptionCheckout')!({}, { tier: 'pro' })

      // Simulate navigation to success URL
      await vi.waitFor(() => {
        expect(willNavigateCallback).toBeDefined()
      })
      willNavigateCallback!({}, 'https://racedash.io/checkout/success?session_id=cs_1')

      const result = await promise
      expect(result.outcome).toBe('success')
      expect(result.sessionId).toBe('cs_1')
      expect(cacheLicense).toHaveBeenCalled()
    })

    it('returns cancelled when user navigates to cancel URL', async () => {
      vi.mocked(fetchWithAuth)
        .mockResolvedValueOnce({ checkoutUrl: 'https://checkout.stripe.com/test', sessionId: 'cs_2' })

      const promise = handlers.get('racedash:stripe:subscriptionCheckout')!({}, { tier: 'plus' })

      await vi.waitFor(() => {
        expect(willNavigateCallback).toBeDefined()
      })
      willNavigateCallback!({}, 'https://racedash.io/checkout/cancel')

      const result = await promise
      expect(result.outcome).toBe('cancelled')
    })

    it('returns cancelled when window is closed without navigation', async () => {
      vi.mocked(fetchWithAuth)
        .mockResolvedValueOnce({ checkoutUrl: 'https://checkout.stripe.com/test', sessionId: 'cs_3' })

      const promise = handlers.get('racedash:stripe:subscriptionCheckout')!({}, { tier: 'pro' })

      await vi.waitFor(() => {
        expect(closedCallback).toBeDefined()
      })
      closedCallback!()

      const result = await promise
      expect(result.outcome).toBe('cancelled')
    })
  })

  describe('creditCheckout', () => {
    it('fetches checkout URL and returns outcome on success', async () => {
      vi.mocked(fetchWithAuth)
        .mockResolvedValueOnce({ checkoutUrl: 'https://checkout.stripe.com/credits', sessionId: 'cs_c1' })
        .mockResolvedValueOnce({ available: 100, total: 200 })

      const promise = handlers.get('racedash:stripe:creditCheckout')!({}, { packSize: 100 })

      await vi.waitFor(() => {
        expect(willNavigateCallback).toBeDefined()
      })
      willNavigateCallback!({}, 'https://racedash.io/checkout/success')

      const result = await promise
      expect(result.outcome).toBe('success')
      expect(result.sessionId).toBe('cs_c1')
    })
  })

  describe('portal', () => {
    it('fetches portal URL and opens externally', async () => {
      vi.mocked(fetchWithAuth).mockResolvedValueOnce({ portalUrl: 'https://billing.stripe.com/portal' })

      const result = await handlers.get('racedash:stripe:portal')!()

      expect(result.portalUrl).toBe('https://billing.stripe.com/portal')
      expect(shell.openExternal).toHaveBeenCalledWith('https://billing.stripe.com/portal')
    })
  })
})
