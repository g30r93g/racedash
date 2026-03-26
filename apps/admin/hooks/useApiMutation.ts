'use client'

import { useState, useCallback } from 'react'

interface MutationOptions<T> {
  url: string
  method?: 'POST' | 'PATCH' | 'DELETE'
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
}

interface MutationReturn<T, B = unknown> {
  mutate: (body: B) => Promise<void>
  isLoading: boolean
  error: string | null
  reset: () => void
}

export function useApiMutation<T = unknown, B = unknown>(opts: MutationOptions<T>): MutationReturn<T, B> {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutate = useCallback(
    async (body: B) => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(opts.url, {
          method: opts.method ?? 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data?.error?.message ?? 'Request failed')
        }
        const data = await res.json()
        opts.onSuccess?.(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        opts.onError?.(message)
      } finally {
        setIsLoading(false)
      }
    },
    [opts],
  )

  const reset = useCallback(() => setError(null), [])

  return { mutate, isLoading, error, reset }
}
