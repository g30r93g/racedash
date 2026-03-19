import { useState, useEffect, useCallback } from 'react'
import type { LicenseInfo } from '../../../types/ipc'

interface UseLicenseReturn {
  license: LicenseInfo | null
  isLoading: boolean
  refresh: () => Promise<void>
}

export function useLicense(isSignedIn: boolean): UseLicenseReturn {
  const [license, setLicense] = useState<LicenseInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.racedash.license.get()
      setLicense(result)
    } catch {
      // Offline or error — try cached
      try {
        const cached = await window.racedash.license.getCached()
        setLicense(cached)
      } catch {
        // No cache available
      }
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn) {
      setLicense(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    refresh().finally(() => setIsLoading(false))

    const cleanup = window.racedash.onLicenseChanged((updated) => {
      setLicense(updated)
    })

    return cleanup
  }, [isSignedIn, refresh])

  return { license, isLoading, refresh }
}
