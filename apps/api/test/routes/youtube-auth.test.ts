import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Set env vars before imports
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.YOUTUBE_CLIENT_ID = 'test-client-id'
process.env.YOUTUBE_CLIENT_SECRET = 'test-client-secret'
process.env.API_BASE_URL = 'https://api.test.com'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  licenses: { id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt' },
  connectedAccounts: {
    id: 'id',
    userId: 'userId',
    platform: 'platform',
    accountName: 'accountName',
    accountId: 'accountId',
    accessToken: 'accessToken',
    refreshToken: 'refreshToken',
    connectedAt: 'connectedAt',
    lastUsedAt: 'lastUsedAt',
  },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn() }))

vi.mock('../../src/lib/token-crypto', () => ({
  encryptToken: vi.fn((s: string) => `encrypted:${s}`),
  decryptToken: vi.fn((s: string) => s.replace('encrypted:', '')),
}))

// Mock global fetch for Google API calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { createTestApp, createUnauthenticatedTestApp } from '../helpers/test-app'
import youtubeAuthRoutes from '../../src/routes/youtube-auth'
import { getDb } from '../../src/lib/db'
import { encryptToken } from '../../src/lib/token-crypto'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = [
    'select',
    'from',
    'where',
    'limit',
    'orderBy',
    'insert',
    'values',
    'update',
    'set',
    'delete',
    'returning',
  ]
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

describe('YouTube Auth Routes', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(youtubeAuthRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  describe('GET /api/auth/youtube/connect', () => {
    it('returns 200 with authUrl containing Google OAuth URL with correct scope and state', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }]) // user lookup
      mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }]) // license lookup

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/connect',
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.authUrl).toContain('accounts.google.com/o/oauth2/v2/auth')
      expect(body.authUrl).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload')
      expect(body.authUrl).toContain('state=')
      expect(body.authUrl).toContain(`client_id=${process.env.YOUTUBE_CLIENT_ID}`)
    })

    it('returns 404 when user not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]) // no user

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/connect',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error.code).toBe('USER_NOT_FOUND')
    })

    it('returns 403 when user has no active license', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }]) // user found
      mockDb.limit.mockResolvedValueOnce([]) // no license

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/connect',
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error.code).toBe('LICENSE_REQUIRED')
    })

    it('returns 401 when not authenticated', async () => {
      const unauthApp = await createUnauthenticatedTestApp(youtubeAuthRoutes)
      try {
        const response = await unauthApp.inject({
          method: 'GET',
          url: '/api/auth/youtube/connect',
        })
        expect(response.statusCode).toBeGreaterThanOrEqual(400)
      } finally {
        await unauthApp.close()
      }
    })
  })

  describe('GET /api/auth/youtube/callback', () => {
    it('returns 400 for missing state parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/callback?code=test-code',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('INVALID_OAUTH_STATE')
    })

    it('returns 400 for tampered state parameter (invalid JWT signature)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/callback?code=test-code&state=invalid.jwt.token',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('INVALID_OAUTH_STATE')
    })

    it('does not require Clerk auth (excluded from middleware)', async () => {
      // The callback route should work without auth — returns 400 for missing state, not 401
      const unauthApp = await createUnauthenticatedTestApp(youtubeAuthRoutes)
      try {
        const response = await unauthApp.inject({
          method: 'GET',
          url: '/api/auth/youtube/callback?code=test-code',
        })
        // Without state it returns 400, NOT 401/500 which would indicate auth failure
        expect(response.statusCode).toBe(400)
        expect(response.json().error.code).toBe('INVALID_OAUTH_STATE')
      } finally {
        await unauthApp.close()
      }
    })

    it('returns 400 when code is missing but state is present', async () => {
      // Create a valid JWT state
      const { createHmac } = await import('node:crypto')
      const key = process.env.TOKEN_ENCRYPTION_KEY!
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const body = Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 })).toString(
        'base64url',
      )
      const signature = createHmac('sha256', key).update(`${header}.${body}`).digest('base64url')
      const validState = `${header}.${body}.${signature}`

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/youtube/callback?state=${validState}`,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('INVALID_OAUTH_STATE')
    })

    it('exchanges code for tokens, fetches channel info, and stores account', async () => {
      const { createHmac } = await import('node:crypto')
      const key = process.env.TOKEN_ENCRYPTION_KEY!
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const body = Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 })).toString(
        'base64url',
      )
      const signature = createHmac('sha256', key).update(`${header}.${body}`).digest('base64url')
      const validState = `${header}.${body}.${signature}`

      // Mock token exchange
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'ya29.test', refresh_token: 'rt_test' }),
        })
        // Mock channel info fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: 'UC123', snippet: { title: 'Test Channel' } }],
          }),
        })

      // No existing connected account
      mockDb.limit.mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/youtube/callback?code=auth_code_123&state=${validState}`,
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/auth/youtube/success')
      expect(mockDb.insert).toHaveBeenCalled()
      expect(encryptToken).toHaveBeenCalledWith('ya29.test')
      expect(encryptToken).toHaveBeenCalledWith('rt_test')
    })

    it('updates existing connected account on re-connect', async () => {
      const { createHmac } = await import('node:crypto')
      const key = process.env.TOKEN_ENCRYPTION_KEY!
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const body = Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 })).toString(
        'base64url',
      )
      const signature = createHmac('sha256', key).update(`${header}.${body}`).digest('base64url')
      const validState = `${header}.${body}.${signature}`

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'ya29.new', refresh_token: 'rt_new' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [{ id: 'UC456', snippet: { title: 'Updated Channel' } }],
          }),
        })

      // Existing connected account found
      mockDb.limit.mockResolvedValueOnce([{ id: 'ca-existing' }])

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/youtube/callback?code=auth_code_456&state=${validState}`,
      })

      expect(response.statusCode).toBe(302)
      expect(mockDb.update).toHaveBeenCalled()
    })

    it('returns 400 when Google token exchange fails', async () => {
      const { createHmac } = await import('node:crypto')
      const key = process.env.TOKEN_ENCRYPTION_KEY!
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const body = Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 })).toString(
        'base64url',
      )
      const signature = createHmac('sha256', key).update(`${header}.${body}`).digest('base64url')
      const validState = `${header}.${body}.${signature}`

      mockFetch.mockResolvedValueOnce({ ok: false, status: 400 })

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/youtube/callback?code=bad_code&state=${validState}`,
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('OAUTH_TOKEN_EXCHANGE_FAILED')
    })

    it('handles channel fetch failure gracefully with default name', async () => {
      const { createHmac } = await import('node:crypto')
      const key = process.env.TOKEN_ENCRYPTION_KEY!
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const body = Buffer.from(JSON.stringify({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 })).toString(
        'base64url',
      )
      const signature = createHmac('sha256', key).update(`${header}.${body}`).digest('base64url')
      const validState = `${header}.${body}.${signature}`

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'ya29.test' }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 })

      mockDb.limit.mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/youtube/callback?code=auth_code&state=${validState}`,
      })

      expect(response.statusCode).toBe(302)
      expect(mockDb.insert).toHaveBeenCalled()
    })
  })

  describe('GET /api/auth/youtube/status', () => {
    it('returns connected=true with account details when YouTube is connected', async () => {
      const connectedAt = new Date('2026-03-18T12:00:00.000Z')
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }]) // user lookup
      mockDb.limit.mockResolvedValueOnce([
        {
          // connected account
          accountName: 'G. Gorzynski Racing',
          accountId: 'UC_test123',
          connectedAt,
        },
      ])

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/status',
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.connected).toBe(true)
      expect(body.account.accountName).toBe('G. Gorzynski Racing')
      expect(body.account.accountId).toBe('UC_test123')
      expect(body.account.connectedAt).toBe('2026-03-18T12:00:00.000Z')
    })

    it('returns connected=false when no YouTube account is connected', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
      mockDb.limit.mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/status',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ connected: false, account: null })
    })

    it('returns connected=false when user not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]) // no user

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/status',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ connected: false, account: null })
    })

    it('does not include access or refresh tokens in response', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
      mockDb.limit.mockResolvedValueOnce([
        {
          accountName: 'Channel',
          accountId: 'UC123',
          connectedAt: new Date(),
        },
      ])

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/youtube/status',
      })

      const body = response.json()
      expect(body).not.toHaveProperty('accessToken')
      expect(body).not.toHaveProperty('refreshToken')
      if (body.account) {
        expect(body.account).not.toHaveProperty('accessToken')
        expect(body.account).not.toHaveProperty('refreshToken')
      }
    })
  })

  describe('DELETE /api/auth/youtube/disconnect', () => {
    it('removes connected_accounts row', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
      mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/youtube/disconnect',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ disconnected: true })
    })

    it('returns 404 when no YouTube account is connected', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
      mockDb.limit.mockResolvedValueOnce([])

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/youtube/disconnect',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error.code).toBe('YOUTUBE_NOT_CONNECTED')
    })

    it('returns 404 when user not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]) // no user

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/auth/youtube/disconnect',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error.code).toBe('USER_NOT_FOUND')
    })
  })

  describe('GET /auth/youtube/success', () => {
    it('returns HTML success page', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/youtube/success',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/html')
      expect(response.body).toContain('YouTube connected successfully')
    })
  })
})
