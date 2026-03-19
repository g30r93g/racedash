import { loadSessionToken } from './auth-helpers'

const API_URL = process.env.VITE_API_URL ?? ''

export async function fetchWithAuth<T>(path: string, opts?: { method?: string; body?: string }): Promise<T> {
  const token = loadSessionToken()
  if (!token) throw new Error('Not authenticated')

  const response = await fetch(`${API_URL}${path}`, {
    method: opts?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: opts?.body,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`API error ${response.status}: ${body}`)
  }

  return response.json() as Promise<T>
}
