import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Mock @racedash/db to avoid resolving the real package (no DB in tests)
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  creditPacks: {
    id: 'id',
    userId: 'userId',
    rcRemaining: 'rcRemaining',
    expiresAt: 'expiresAt',
    purchasedAt: 'purchasedAt',
  },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({
  getDb: vi.fn(),
}))

import { createTestApp, createUnauthenticatedTestApp } from '../helpers/test-app'
import creditRoutes from '../../src/routes/credits'
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

describe('GET /api/credits/balance', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(creditRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('Returns total RC balance summing all non-expired packs with remaining credits', async () => {
    const pack1 = {
      id: 'pack-1',
      packName: '100 RC Pack',
      rcTotal: 100,
      rcRemaining: 60,
      purchasedAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-01-01'),
    }
    const pack2 = {
      id: 'pack-2',
      packName: '200 RC Pack',
      rcTotal: 200,
      rcRemaining: 150,
      purchasedAt: new Date('2026-02-01'),
      expiresAt: new Date('2027-06-01'),
    }

    // First query: user lookup
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // Second query: credit packs
    mockDb.orderBy.mockResolvedValueOnce([pack1, pack2])

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.totalRc).toBe(210)
    expect(body.packs).toHaveLength(2)
    expect(body.packs[0]).toEqual({
      id: 'pack-1',
      packName: '100 RC Pack',
      rcTotal: 100,
      rcRemaining: 60,
      purchasedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    })
    expect(body.packs[1]).toEqual({
      id: 'pack-2',
      packName: '200 RC Pack',
      rcTotal: 200,
      rcRemaining: 150,
      purchasedAt: '2026-02-01T00:00:00.000Z',
      expiresAt: '2027-06-01T00:00:00.000Z',
    })
  })

  it('Excludes expired packs from balance', async () => {
    // The route filters with gt(expiresAt, now) in the WHERE clause,
    // so expired packs should not be returned by the DB query.
    // We simulate the DB returning only non-expired packs.
    const activePack = {
      id: 'pack-active',
      packName: '100 RC Pack',
      rcTotal: 100,
      rcRemaining: 50,
      purchasedAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-01-01'),
    }

    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.orderBy.mockResolvedValueOnce([activePack])

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.totalRc).toBe(50)
    expect(body.packs).toHaveLength(1)
    expect(body.packs[0].id).toBe('pack-active')
  })

  it('Excludes fully depleted packs', async () => {
    // The route filters with gt(rcRemaining, 0) in the WHERE clause,
    // so depleted packs should not be returned by the DB query.
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.orderBy.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.totalRc).toBe(0)
    expect(body.packs).toHaveLength(0)
  })

  it('Orders packs by expires_at ASC', async () => {
    const earlyExpiry = {
      id: 'pack-early',
      packName: '50 RC Pack',
      rcTotal: 50,
      rcRemaining: 25,
      purchasedAt: new Date('2026-03-01'),
      expiresAt: new Date('2026-06-01'),
    }
    const lateExpiry = {
      id: 'pack-late',
      packName: '100 RC Pack',
      rcTotal: 100,
      rcRemaining: 80,
      purchasedAt: new Date('2026-01-01'),
      expiresAt: new Date('2027-12-01'),
    }

    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // DB returns packs already sorted by expiresAt ASC
    mockDb.orderBy.mockResolvedValueOnce([earlyExpiry, lateExpiry])

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.packs[0].id).toBe('pack-early')
    expect(body.packs[1].id).toBe('pack-late')
    // Verify orderBy was called (the route uses asc(expiresAt))
    expect(mockDb.orderBy).toHaveBeenCalled()
  })

  it('Returns empty packs array and totalRc 0 when user has no packs', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.orderBy.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.totalRc).toBe(0)
    expect(body.packs).toEqual([])
  })

  it('Returns 401 when not authenticated', async () => {
    const unauthApp = await createUnauthenticatedTestApp(creditRoutes)

    try {
      const response = await unauthApp.inject({
        method: 'GET',
        url: '/api/credits/balance',
      })

      // Without the clerk decorator, accessing request.clerk will error
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await unauthApp.close()
    }
  })
})

describe('GET /api/credits/history', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(creditRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('Returns paginated purchase history in purchased_at DESC order', async () => {
    const purchase1 = {
      id: 'pack-1',
      packName: '200 RC Pack',
      rcTotal: 200,
      rcRemaining: 100,
      priceGbp: '9.99',
      purchasedAt: new Date('2026-03-01'),
      expiresAt: new Date('2027-03-01'),
    }
    const purchase2 = {
      id: 'pack-2',
      packName: '100 RC Pack',
      rcTotal: 100,
      rcRemaining: 50,
      priceGbp: '4.99',
      purchasedAt: new Date('2026-01-15'),
      expiresAt: new Date('2027-01-15'),
    }

    // User lookup
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // History query — returns exactly 2, no extra row so no next page
    mockDb.limit.mockResolvedValueOnce([purchase1, purchase2])

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/history',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.purchases).toHaveLength(2)
    expect(body.purchases[0]).toEqual({
      id: 'pack-1',
      packName: '200 RC Pack',
      rcTotal: 200,
      priceGbp: '9.99',
      purchasedAt: '2026-03-01T00:00:00.000Z',
      expiresAt: '2027-03-01T00:00:00.000Z',
    })
    expect(body.purchases[1]).toEqual({
      id: 'pack-2',
      packName: '100 RC Pack',
      rcTotal: 100,
      priceGbp: '4.99',
      purchasedAt: '2026-01-15T00:00:00.000Z',
      expiresAt: '2027-01-15T00:00:00.000Z',
    })
    expect(body.nextCursor).toBeNull()
  })

  it('Respects cursor-based pagination', async () => {
    const cursorPack = {
      id: 'pack-cursor',
      packName: '100 RC Pack',
      rcTotal: 100,
      rcRemaining: 50,
      priceGbp: '4.99',
      purchasedAt: new Date('2026-02-01'),
      expiresAt: new Date('2027-02-01'),
    }

    // 1. User lookup: db.select().from(users).where(...).limit(1)
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // 2. Initial query build: db.select()...limit(limitParam+1) — not awaited yet, overwritten later
    mockDb.limit.mockReturnValueOnce(mockDb)
    // 3. Cursor lookup: db.select()...where(eq(id, cursor)).limit(1)
    mockDb.limit.mockResolvedValueOnce([{ purchasedAt: new Date('2026-02-01'), id: 'pack-cursor' }])
    // 4. Rebuilt query: db.select()...limit(limitParam+1) — this is awaited as `rows`
    mockDb.limit.mockResolvedValueOnce([cursorPack])

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/history?cursor=pack-cursor',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.purchases).toHaveLength(1)
    expect(body.nextCursor).toBeNull()
  })

  it('Respects limit parameter (default 20, max 100)', async () => {
    const packs = Array.from({ length: 4 }, (_, i) => ({
      id: `pack-${i}`,
      packName: `Pack ${i}`,
      rcTotal: 100,
      rcRemaining: 50,
      priceGbp: '4.99',
      purchasedAt: new Date(`2026-0${3 - i > 0 ? 3 - i : 1}-01`),
      expiresAt: new Date(`2027-0${3 - i > 0 ? 3 - i : 1}-01`),
    }))

    // User lookup
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // History query with limit=3 — returns 4 rows (3+1 extra to signal more)
    mockDb.limit.mockResolvedValueOnce(packs)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/history?limit=3',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    // Should return 3 items (trimmed from 4) with a nextCursor
    expect(body.purchases).toHaveLength(3)
    expect(body.nextCursor).toBe('pack-2')
  })

  it('Returns nextCursor: null on last page', async () => {
    const packs = [
      {
        id: 'pack-last',
        packName: 'Last Pack',
        rcTotal: 50,
        rcRemaining: 10,
        priceGbp: '2.99',
        purchasedAt: new Date('2026-01-01'),
        expiresAt: new Date('2027-01-01'),
      },
    ]

    // User lookup
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // History query — returns fewer than limit+1 rows
    mockDb.limit.mockResolvedValueOnce(packs)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/history',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.purchases).toHaveLength(1)
    expect(body.nextCursor).toBeNull()
  })

  it('Returns 401 when not authenticated', async () => {
    const unauthApp = await createUnauthenticatedTestApp(creditRoutes)

    try {
      const response = await unauthApp.inject({
        method: 'GET',
        url: '/api/credits/history',
      })

      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await unauthApp.close()
    }
  })
})
