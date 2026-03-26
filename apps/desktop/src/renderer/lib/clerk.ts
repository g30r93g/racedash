import type { FapiRequestInit, FapiResponse } from '@clerk/clerk-js/dist/types/core/fapiClient'
import { Clerk } from '@clerk/clerk-js'

const CLIENT_TOKEN_KEY = '__clerk_client_jwt'

/**
 * Token cache backed by Electron IPC — persists the Clerk client JWT
 * to the main process (encrypted on disk via safeStorage).
 */
const IpcTokenCache = {
  async getToken(_key: string): Promise<string> {
    const token = await window.racedash.auth.getClientToken()
    return token ?? ''
  },
  saveToken(_key: string, token: string): void {
    window.racedash.auth.saveClientToken(token)
  },
  clearToken(_key: string): void {
    window.racedash.auth.clearToken()
  },
}

let clerkInstance: Clerk | undefined

export function getClerkInstance(): Clerk {
  if (clerkInstance) return clerkInstance

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  if (!publishableKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable')
  }

  clerkInstance = new Clerk(publishableKey)

  // Electron's renderer is a browser context — Clerk handles auth via
  // cookies and Origin header natively. We only intercept responses to
  // capture the client JWT for persistence across app restarts via IPC.
  clerkInstance.__internal_onAfterResponse(async (_: FapiRequestInit, response: FapiResponse<unknown>) => {
    const authHeader = response.headers.get('authorization')
    if (authHeader) {
      IpcTokenCache.saveToken(CLIENT_TOKEN_KEY, authHeader)
    }
  })

  return clerkInstance
}
