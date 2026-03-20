import { auth } from '@clerk/nextjs/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) {
    throw new Error('Not authenticated')
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? `API error: ${res.status}`)
  }

  return res.json()
}
