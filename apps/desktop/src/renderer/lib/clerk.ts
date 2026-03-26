import type { FapiRequestInit, FapiResponse } from '@clerk/clerk-js/dist/types/core/fapiClient'
import { Clerk } from '@clerk/clerk-js/headless'

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

  // Intercept outgoing requests: strip cookies (not in a browser context),
  // append _is_native flag, and attach the cached JWT
  clerkInstance.__unstable__onBeforeRequest(async (requestInit: FapiRequestInit) => {
    requestInit.credentials = 'omit'
    requestInit.url?.searchParams.append('_is_native', '1')

    const jwt = await IpcTokenCache.getToken(CLIENT_TOKEN_KEY)
    ;(requestInit.headers as Headers).set('authorization', jwt || '')
  })

  // Intercept responses: capture the refreshed JWT from Clerk's API
  // and sync it to the main process for storage
  // @ts-expect-error __unstable__onAfterResponse is an internal API
  clerkInstance.__unstable__onAfterResponse(async (_: FapiRequestInit, response: FapiResponse<unknown>) => {
    const authHeader = response.headers.get('authorization')
    if (authHeader) {
      IpcTokenCache.saveToken(CLIENT_TOKEN_KEY, authHeader)
    }
  })

  return clerkInstance
}
