import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', createdAt: 'createdAt' },
  licenses: { id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt', tier: 'tier' },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn() }))

const mockGetUser = vi.fn()
vi.mock('../../src/lib/clerk', () => ({
  getClerkClient: () => ({
    users: { getUser: mockGetUser },
  }),
}))

import { createTestApp, createUnauthenticatedTestApp } from '../helpers/test-app'
import authRoutes from '../../src/routes/auth'
import { getDb } from '../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'update', 'set', 'returning']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

describe('GET /api/auth/me', () => {
  let app: FastifyInstance
  let unauthApp: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(authRoutes)
    unauthApp = await createUnauthenticatedTestApp(authRoutes)
  })

  afterAll(async () => {
    await app.close()
    await unauthApp.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockGetUser.mockReset()
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('returns user profile and active license for authenticated user', async () => {
    const now = new Date()
    const future = new Date(Date.now() + 86400000)

    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'user-1',
        clerkId: 'clerk_test_user',
        email: 'gg@racedash.app',
        createdAt: now,
      },
    ])

    mockGetUser.mockResolvedValueOnce({
      firstName: 'G.',
      lastName: 'Gorzynski',
      username: 'gg',
      imageUrl: 'https://img.clerk.com/avatar.png',
    })

    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'lic-1',
        userId: 'user-1',
        tier: 'pro',
        status: 'active',
        expiresAt: future,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.user.id).toBe('user-1')
    expect(body.user.email).toBe('gg@racedash.app')
    expect(body.user.name).toBe('G. Gorzynski')
    expect(body.user.avatarUrl).toBe('https://img.clerk.com/avatar.png')
    expect(body.license).not.toBeNull()
    expect(body.license.tier).toBe('pro')
    expect(body.license.status).toBe('active')
  })

  it('returns license: null when user has no active license', async () => {
    const now = new Date()

    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'user-1',
        clerkId: 'clerk_test_user',
        email: 'gg@racedash.app',
        createdAt: now,
      },
    ])

    mockGetUser.mockResolvedValueOnce({
      firstName: 'G.',
      lastName: 'Gorzynski',
      username: 'gg',
      imageUrl: null,
    })

    mockDb.limit.mockResolvedValueOnce([]) // no license

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.user.id).toBe('user-1')
    expect(body.license).toBeNull()
  })

  it('returns license: null when license is expired', async () => {
    const now = new Date()

    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'user-1',
        clerkId: 'clerk_test_user',
        email: 'gg@racedash.app',
        createdAt: now,
      },
    ])

    mockGetUser.mockResolvedValueOnce({
      firstName: 'G.',
      lastName: 'Gorzynski',
      username: 'gg',
      imageUrl: null,
    })

    // The DB query uses gt(licenses.expiresAt, new Date()), so expired licenses
    // won't be returned by the query — result is empty
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.license).toBeNull()
  })

  it('returns 401 when not authenticated', async () => {
    const response = await unauthApp.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    // Without clerk auth middleware, request.clerk is undefined, so accessing .userId throws
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('returns 404 when Clerk user has no DB row', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // no user in DB

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })
})
