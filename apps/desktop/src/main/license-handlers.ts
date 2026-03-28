import { BrowserWindow, ipcMain } from 'electron'
import type { LicenseInfo, CreditBalance, CreditHistory } from '../types/ipc'
import { cacheLicense, loadCachedLicense } from './license-cache'
import { fetchWithAuth } from './api-client'

export function registerLicenseHandlers(_mainWindow: BrowserWindow): void {
  ipcMain.handle('racedash:license:get', async () => {
    const { license } = await fetchWithAuth<{ license: LicenseInfo | null }>('/api/license')
    cacheLicense(license)
    return license
  })

  ipcMain.handle('racedash:license:getCached', async () => {
    return loadCachedLicense()
  })

  ipcMain.handle('racedash:credits:getBalance', async () => {
    return fetchWithAuth<CreditBalance>('/api/credits/balance')
  })

  ipcMain.handle('racedash:credits:getHistory', async (_event, cursor?: string) => {
    const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return fetchWithAuth<CreditHistory>(`/api/credits/history${params}`)
  })
}
