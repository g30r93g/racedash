import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { useUser, useSession, useClerk } from '@clerk/react'
import type { AuthUser, AuthLicense, FetchWithAuthResponse } from '../../../types/ipc'

// Context for controlling the auth modal from useAuth().signIn()
const AuthModalContext = createContext<{
  open: boolean
  setOpen: (open: boolean) => void
}>({ open: false, setOpen: () => {} })

export { AuthModalContext }

interface UseAuthReturn {
  user: AuthUser | null
  license: AuthLicense | null
  isSignedIn: boolean
  isLoading: boolean
  signIn: () => void
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const { user: clerkUser, isSignedIn, isLoaded: userLoaded } = useUser()
  const { session } = useSession()
  const clerk = useClerk()
  const [profile, setProfile] = useState<{ user: AuthUser; license: AuthLicense | null } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Sync session token to main process whenever it changes
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function syncToken(): Promise<void> {
      try {
        const token = await session!.getToken()
        if (token && !cancelled) {
          // The client token is synced by the Clerk interceptors in lib/clerk.ts
          // Here we sync the session JWT that main process uses for API calls
          window.racedash.auth.saveSessionToken(token)
        }
      } catch {
        // Token fetch failed — will retry on next render
      }
    }

    syncToken()

    // Re-sync every 50 seconds (session JWTs expire in ~60s)
    const interval = setInterval(syncToken, 50_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session])

  // Fetch user profile + license from API after sign-in
  useEffect(() => {
    if (!isSignedIn || !session) {
      setProfile(null)
      setIsLoading(!userLoaded)
      return
    }

    let cancelled = false

    async function fetchProfile(): Promise<void> {
      try {
        const token = await session!.getToken()
        if (!token || cancelled) return

        // Ensure main process has the token before making the API call
        window.racedash.auth.saveSessionToken(token)

        const response: FetchWithAuthResponse = await window.racedash.auth.fetchWithAuth(
          '/api/auth/me',
        )

        if (cancelled) return

        if (response.status === 200) {
          const data = JSON.parse(response.body)
          setProfile({ user: data.user, license: data.license })
        } else {
          setProfile(null)
        }
      } catch {
        if (!cancelled) setProfile(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchProfile()
    return () => { cancelled = true }
  }, [isSignedIn, session, clerkUser?.id])

  const authModal = useContext(AuthModalContext)

  const signIn = useCallback(() => {
    authModal.setOpen(true)
  }, [authModal])

  const signOut = useCallback(async () => {
    await clerk.signOut()
    window.racedash.auth.clearToken()
    setProfile(null)
  }, [clerk])

  return {
    user: profile?.user ?? null,
    license: profile?.license ?? null,
    isSignedIn: isSignedIn === true && profile !== null,
    isLoading: isLoading || !userLoaded,
    signIn,
    signOut,
  }
}
