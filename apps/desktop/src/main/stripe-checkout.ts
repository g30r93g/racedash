import { BrowserWindow, ipcMain, shell } from 'electron'
import type { StripeCheckoutResult, LicenseInfo, CreditBalance } from '../types/ipc'
import { cacheLicense } from './license-cache'
import { fetchWithAuth } from './api-client'

const SUCCESS_HOST = 'racedash.io'
const CHECKOUT_SUCCESS_PATH = '/checkout/success'
const CHECKOUT_CANCEL_PATH = '/checkout/cancel'

function openCheckoutWindow(
  parentWindow: BrowserWindow,
  checkoutUrl: string,
  title: string,
): Promise<'success' | 'cancelled'> {
  return new Promise((resolve, reject) => {
    const checkoutWin = new BrowserWindow({
      width: 600,
      height: 800,
      parent: parentWindow,
      modal: true,
      title,
      webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        partition: 'persist:stripe-checkout',
      },
    })

    let resolved = false

    const handleNavigation = (_event: Electron.Event, url: string): void => {
      try {
        const parsed = new URL(url)
        if (parsed.hostname === SUCCESS_HOST && parsed.pathname === CHECKOUT_SUCCESS_PATH) {
          resolved = true
          checkoutWin.close()
          resolve('success')
        } else if (parsed.hostname === SUCCESS_HOST && parsed.pathname === CHECKOUT_CANCEL_PATH) {
          resolved = true
          checkoutWin.close()
          resolve('cancelled')
        }
      } catch {
        // Invalid URL — ignore
      }
    }

    checkoutWin.webContents.on('will-navigate', handleNavigation)
    checkoutWin.webContents.on('did-navigate', handleNavigation)

    checkoutWin.on('closed', () => {
      if (!resolved) resolve('cancelled')
    })

    checkoutWin.loadURL(checkoutUrl).catch(reject)
  })
}

export function registerStripeHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    'racedash:stripe:subscriptionCheckout',
    async (_event, opts: { tier: 'plus' | 'pro' }): Promise<StripeCheckoutResult> => {
      const { checkoutUrl, sessionId } = await fetchWithAuth<{ checkoutUrl: string; sessionId: string }>(
        '/api/stripe/checkout',
        { method: 'POST', body: JSON.stringify({ tier: opts.tier }) },
      )

      const outcome = await openCheckoutWindow(
        mainWindow,
        checkoutUrl,
        'RaceDash Cloud \u2014 Subscribe',
      )

      if (outcome === 'success') {
        try {
          const { license } = await fetchWithAuth<{ license: LicenseInfo | null }>('/api/license')
          cacheLicense(license)
          mainWindow.webContents.send('racedash:license:changed', license)
        } catch {
          // License fetch may fail — the webhook hasn't arrived yet
        }
      }

      return { outcome, sessionId }
    },
  )

  ipcMain.handle(
    'racedash:stripe:creditCheckout',
    async (_event, opts: { packSize: number }): Promise<StripeCheckoutResult> => {
      const { checkoutUrl, sessionId } = await fetchWithAuth<{ checkoutUrl: string; sessionId: string }>(
        '/api/stripe/credits/checkout',
        { method: 'POST', body: JSON.stringify({ packSize: opts.packSize }) },
      )

      const outcome = await openCheckoutWindow(
        mainWindow,
        checkoutUrl,
        'RaceDash Cloud \u2014 Purchase Credits',
      )

      if (outcome === 'success') {
        try {
          const balance = await fetchWithAuth<CreditBalance>('/api/credits/balance')
          mainWindow.webContents.send('racedash:credits:changed', balance)
        } catch {
          // Balance fetch may fail — the webhook hasn't arrived yet
        }
      }

      return { outcome, sessionId }
    },
  )

  ipcMain.handle('racedash:stripe:portal', async (): Promise<{ portalUrl: string }> => {
    const { portalUrl } = await fetchWithAuth<{ portalUrl: string }>(
      '/api/stripe/portal',
      { method: 'POST' },
    )
    shell.openExternal(portalUrl)
    return { portalUrl }
  })
}
