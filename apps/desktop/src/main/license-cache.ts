import { safeStorage, app } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { LicenseInfo } from '../types/ipc'

const LICENSE_CACHE_FILE = 'cloud-license.enc'

function getCachePath(): string {
  return path.join(app.getPath('userData'), LICENSE_CACHE_FILE)
}

export function cacheLicense(license: LicenseInfo | null): void {
  const cachePath = getCachePath()
  if (!license) {
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)
    return
  }
  const json = JSON.stringify(license)
  const encrypted = safeStorage.encryptString(json)
  fs.writeFileSync(cachePath, encrypted)
}

export function loadCachedLicense(): LicenseInfo | null {
  const cachePath = getCachePath()
  if (!fs.existsSync(cachePath)) return null
  try {
    const encrypted = fs.readFileSync(cachePath)
    const json = safeStorage.decryptString(encrypted)
    return JSON.parse(json) as LicenseInfo
  } catch {
    // Corrupted or unreadable — clear it
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)
    return null
  }
}
