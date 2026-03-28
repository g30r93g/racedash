import { getSessionToken } from './auth'

export function loadSessionToken(): string | null {
  return getSessionToken()
}
