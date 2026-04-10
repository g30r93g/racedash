'use client'

import { useEffect, useState } from 'react'

export type Platform = 'mac' | 'windows' | 'other'

// Client-only hook that detects the user's operating system from the
// userAgent string. Returns `null` until mounted so SSR/client markup
// matches (otherwise hydration mismatches the download button styling).
export function usePlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = window.navigator.userAgent
    if (/Mac|iPhone|iPad|iPod/i.test(ua)) {
      setPlatform('mac')
    } else if (/Win/i.test(ua)) {
      setPlatform('windows')
    } else {
      setPlatform('other')
    }
  }, [])

  return platform
}
