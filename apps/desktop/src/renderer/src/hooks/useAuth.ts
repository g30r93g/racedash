import { useState, useEffect, useCallback } from 'react'
import type { AuthSession, AuthUser, AuthLicense } from '../../../types/ipc'

interface UseAuthReturn {
  user: AuthUser | null
  license: AuthLicense | null
  isSignedIn: boolean
  isLoading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    window.racedash.auth.getSession().then((restored) => {
      setSession(restored)
      setIsLoading(false)
    }).catch(() => {
      setIsLoading(false)
    })

    // Listen for session expiry
    const cleanup = window.racedash.onAuthSessionExpired(() => {
      setSession(null)
    })

    return cleanup
  }, [])

  const signIn = useCallback(async () => {
    try {
      const newSession = await window.racedash.auth.signIn()
      setSession(newSession)
    } catch {
      // User closed the window or auth failed — do nothing
    }
  }, [])

  const signOut = useCallback(async () => {
    await window.racedash.auth.signOut()
    setSession(null)
  }, [])

  return {
    user: session?.user ?? null,
    license: session?.license ?? null,
    isSignedIn: session !== null,
    isLoading,
    signIn,
    signOut,
  }
}
