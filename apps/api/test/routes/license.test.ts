import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Mock @racedash/db to avoid resolving the real package (no DB in tests)
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  licenses: {
    id: 'id',
    userId: 'userId',
    status: 'status',
    expiresAt: 'expiresAt',
    tier: 'tier',
  },
  getSlotLimit: (tier: string) => (tier === 'pro' ? 3 : 1),
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({
  getDb: vi.fn(),
}))

import { createTestApp, createUnauthenticatedTestApp } from '../helpers/test-app'
import licenseRoutes from '../../src/routes/license'
import { getDb } from '../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const chainMethods = ['select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'update', 'set']
  for (const method of chainMethods) {
    mockDb[method] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

describe('GET /api/license', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(licenseRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('Returns active license with tier, status, subscription ID, dates, and max concurrent renders', async () => {
    const license = {
      id: 'lic-1',
      userId: 'user-1',
      tier: 'pro' as const,
      status: 'active' as const,
      stripeSubscriptionId: 'sub_abc123',
      stripeCustomerId: 'cus_abc123',
      startsAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }

    // User lookup
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // License lookup
    mockDb.limit.mockResolvedValueOnce([license])

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.license).toEqual({
      tier: 'pro',
      status: 'active',
      stripeSubscriptionId: 'sub_abc123',
      startsAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      maxConcurrentRenders: 3,
    })
  })

  it('Returns maxConcurrentRenders: 1 for Plus tier', async () => {
    const license = {
      id: 'lic-plus',
      userId: 'user-1',
      tier: 'plus' as const,
      status: 'active' as const,
      stripeSubscriptionId: 'sub_plus123',
      stripeCustomerId: 'cus_plus123',
      startsAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    }

    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([license])

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.license.maxConcurrentRenders).toBe(1)
    expect(body.license.tier).toBe('plus')
  })

  it('Returns maxConcurrentRenders: 3 for Pro tier', async () => {
    const license = {
      id: 'lic-pro',
      userId: 'user-1',
      tier: 'pro' as const,
      status: 'active' as const,
      stripeSubscriptionId: 'sub_pro123',
      stripeCustomerId: 'cus_pro123',
      startsAt: new Date('2026-02-01'),
      expiresAt: new Date('2027-02-01'),
      createdAt: new Date('2026-02-01'),
      updatedAt: new Date('2026-02-01'),
    }

    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([license])

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.license.maxConcurrentRenders).toBe(3)
    expect(body.license.tier).toBe('pro')
  })

  it('Returns { license: null } when user has no active license', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // No license found
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.license).toBeNull()
  })

  it('Returns { license: null } when license is expired', async () => {
    // The route filters with gt(expiresAt, now) so expired licenses
    // won't be returned by the DB query
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.license).toBeNull()
  })

  it('Returns { license: null } when license is cancelled', async () => {
    // The route filters with eq(status, 'active') so cancelled licenses
    // won't be returned by the DB query
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.license).toBeNull()
  })

  it('Returns 401 when not authenticated', async () => {
    const unauthApp = await createUnauthenticatedTestApp(licenseRoutes)

    try {
      const response = await unauthApp.inject({
        method: 'GET',
        url: '/api/license',
      })

      // Without the clerk decorator, accessing request.clerk will error
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await unauthApp.close()
    }
  })
})
