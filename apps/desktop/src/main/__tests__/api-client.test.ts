import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../auth-helpers', () => ({
  loadSessionToken: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { fetchWithAuth } from '../api-client'
import { loadSessionToken } from '../auth-helpers'

describe('fetchWithAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadSessionToken).mockReturnValue('test-token-123')
  })

  it('throws when not authenticated', async () => {
    vi.mocked(loadSessionToken).mockReturnValue(null)
    await expect(fetchWithAuth('/api/test')).rejects.toThrow('Not authenticated')
  })

  it('attaches bearer token and defaults to GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    })

    const result = await fetchWithAuth('/api/test')
    expect(result).toEqual({ data: 'test' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      }),
    )
  })

  it('sends POST with body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '123' }),
    })

    await fetchWithAuth('/api/jobs', { method: 'POST', body: JSON.stringify({ name: 'test' }) })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"test"}',
      }),
    )
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })

    await expect(fetchWithAuth('/api/test')).rejects.toThrow('API error 401: Unauthorized')
  })
})
