'use client'

import { useAuth, useUser } from '@clerk/nextjs'

interface AdminAuth {
  isAdmin: boolean
  isLoading: boolean
  clerkId: string | null
}

export function useAdminAuth(): AdminAuth {
  const { userId, isLoaded: isAuthLoaded } = useAuth()
  const { user, isLoaded: isUserLoaded } = useUser()

  const isLoading = !isAuthLoaded || !isUserLoaded

  const isAdmin =
    !isLoading && !!userId && (user?.publicMetadata as Record<string, unknown>)?.role === 'admin'

  return {
    isAdmin,
    isLoading,
    clerkId: userId ?? null,
  }
}
