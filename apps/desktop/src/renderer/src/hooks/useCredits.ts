import { useState, useEffect, useCallback } from 'react'
import type { CreditBalance, CreditHistory } from '../../../types/ipc'

interface UseCreditsReturn {
  balance: CreditBalance | null
  isLoading: boolean
  refresh: () => Promise<void>
  fetchHistory: (cursor?: string) => Promise<CreditHistory>
}

export function useCredits(isSignedIn: boolean): UseCreditsReturn {
  const [balance, setBalance] = useState<CreditBalance | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await window.racedash.credits.getBalance()
      setBalance(result)
    } catch {
      // Offline or error
    }
  }, [])

  const fetchHistory = useCallback(async (cursor?: string): Promise<CreditHistory> => {
    return window.racedash.credits.getHistory(cursor)
  }, [])

  useEffect(() => {
    if (!isSignedIn) {
      setBalance(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    refresh().finally(() => setIsLoading(false))

    const cleanup = window.racedash.onCreditsChanged((updated) => {
      setBalance(updated)
    })

    return cleanup
  }, [isSignedIn, refresh])

  return { balance, isLoading, refresh, fetchHistory }
}
