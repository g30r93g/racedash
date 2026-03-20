import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', createdAt: 'createdAt', billingCountry: 'billingCountry', stripeCustomerId: 'stripeCustomerId' },
  licenses: { id: 'id', userId: 'userId', status: 'status', tier: 'tier', expiresAt: 'expiresAt', createdAt: 'createdAt', updatedAt: 'updatedAt', stripeSubscriptionId: 'stripeSubscriptionId', startsAt: 'startsAt', stripeCustomerId: 'stripeCustomerId' },
  creditPacks: { id: 'id', userId: 'userId', packName: 'packName', rcTotal: 'rcTotal', rcRemaining: 'rcRemaining', priceGbp: 'priceGbp', purchasedAt: 'purchasedAt', expiresAt: 'expiresAt' },
  jobs: { id: 'id', userId: 'userId', status: 'status', rcCost: 'rcCost', createdAt: 'createdAt', updatedAt: 'updatedAt' },
  eq: vi.fn(), and: vi.fn(), gt: vi.fn(), asc: vi.fn(), desc: vi.fn(), sql: vi.fn(), ilike: vi.fn(),
}))

vi.mock('../../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../../helpers/test-app'
import usersRoutes from '../../../src/routes/admin/users'
import { getDb } from '../../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'update', 'set', 'returning', 'transaction', 'innerJoin', 'groupBy']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

const now = new Date()

describe('GET /api/admin/users', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(usersRoutes)
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

  it('lists users with pagination', async () => {
    const mockUsers = [
      { id: 'u-1', clerkId: 'clerk_1', email: 'a@test.com', createdAt: now, licenseTier: 'pro' },
      { id: 'u-2', clerkId: 'clerk_2', email: 'b@test.com', createdAt: now, licenseTier: null },
    ]
    mockDb.limit.mockResolvedValueOnce(mockUsers)

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.users).toHaveLength(2)
    expect(body.nextCursor).toBeNull()
  })

  it('applies search filter', async () => {
    mockDb.limit.mockResolvedValueOnce([
      { id: 'u-1', clerkId: 'clerk_1', email: 'match@test.com', createdAt: now, licenseTier: null },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users?search=match',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().users).toHaveLength(1)
  })

  it('returns nextCursor when more results exist', async () => {
    // Default limit is 50, so return 51 items to trigger hasMore
    const mockUsers = Array.from({ length: 51 }, (_, i) => ({
      id: `u-${i}`,
      clerkId: `clerk_${i}`,
      email: `user${i}@test.com`,
      createdAt: now,
      licenseTier: null,
    }))
    mockDb.limit.mockResolvedValueOnce(mockUsers)

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.users).toHaveLength(50)
    expect(body.nextCursor).toBe('u-49')
  })

  it('uses default limit of 50', async () => {
    mockDb.limit.mockResolvedValueOnce([])

    await app.inject({
      method: 'GET',
      url: '/api/admin/users',
    })

    // limit(51) is called because code does limit + 1
    expect(mockDb.limit).toHaveBeenCalledWith(51)
  })

  it('caps limit at 100', async () => {
    mockDb.limit.mockResolvedValueOnce([])

    await app.inject({
      method: 'GET',
      url: '/api/admin/users?limit=200',
    })

    // Max limit is 100, so limit(101)
    expect(mockDb.limit).toHaveBeenCalledWith(101)
  })
})

describe('GET /api/admin/users/:id', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(usersRoutes)
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

  it('returns full user data for existing user', async () => {
    // User query
    mockDb.limit.mockResolvedValueOnce([{
      id: 'u-1', clerkId: 'clerk_1', email: 'user@test.com',
      billingCountry: 'GB', stripeCustomerId: 'cus_123', createdAt: now,
    }])
    // Licenses
    mockDb.orderBy.mockResolvedValueOnce([{
      id: 'lic-1', tier: 'pro', status: 'active',
      stripeSubscriptionId: 'sub_1', startsAt: now, expiresAt: now,
      createdAt: now, updatedAt: now,
    }])
    // Credit packs
    mockDb.orderBy.mockResolvedValueOnce([{
      id: 'cp-1', packName: 'Starter', rcTotal: 100, rcRemaining: 50,
      priceGbp: '9.99', purchasedAt: now, expiresAt: now,
    }])
    // Recent jobs
    mockDb.limit.mockResolvedValueOnce([{
      id: 'job-1', status: 'complete', rcCost: 10,
      createdAt: now, updatedAt: now,
    }])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users/u-1',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.user.id).toBe('u-1')
    expect(body.user.email).toBe('user@test.com')
  })

  it('returns 404 for missing user', async () => {
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users/nonexistent',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('includes licenses, credit packs, and recent jobs', async () => {
    mockDb.limit.mockResolvedValueOnce([{
      id: 'u-1', clerkId: 'clerk_1', email: 'user@test.com',
      billingCountry: 'GB', stripeCustomerId: 'cus_123', createdAt: now,
    }])
    mockDb.orderBy.mockResolvedValueOnce([
      { id: 'lic-1', tier: 'pro', status: 'active', stripeSubscriptionId: 'sub_1', startsAt: now, expiresAt: now, createdAt: now, updatedAt: now },
      { id: 'lic-2', tier: 'plus', status: 'cancelled', stripeSubscriptionId: null, startsAt: now, expiresAt: now, createdAt: now, updatedAt: now },
    ])
    mockDb.orderBy.mockResolvedValueOnce([
      { id: 'cp-1', packName: 'Starter', rcTotal: 100, rcRemaining: 50, priceGbp: '9.99', purchasedAt: now, expiresAt: now },
    ])
    mockDb.limit.mockResolvedValueOnce([
      { id: 'job-1', status: 'complete', rcCost: 10, createdAt: now, updatedAt: now },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users/u-1',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.licenses).toHaveLength(2)
    expect(body.creditPacks).toHaveLength(1)
    expect(body.recentJobs).toHaveLength(1)
  })
})
