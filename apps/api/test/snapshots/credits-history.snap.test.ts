import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'
import creditRoutes from '../../src/routes/credits'

// Mock @racedash/db
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', stripeCustomerId: 'stripeCustomerId' },
  creditPacks: {
    id: 'id',
    userId: 'userId',
    rcRemaining: 'rcRemaining',
    expiresAt: 'expiresAt',
    packName: 'packName',
    rcTotal: 'rcTotal',
    purchasedAt: 'purchasedAt',
    priceGbp: 'priceGbp',
  },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  desc: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  asc: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({
  getDb: vi.fn(),
}))

import { getDb } from '../../src/lib/db'

const mockGetDb = vi.mocked(getDb)

function createChainableQuery(rows: unknown[] = []) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue(rows)
  chain.then = (resolve: (v: unknown) => void) => resolve(rows)
  return chain
}

describe('Credits history response snapshots', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(creditRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Matches snapshot for first page of purchase history', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 86400000 * 365)

    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const historyQuery = createChainableQuery([
      {
        id: 'pack-1',
        packName: '50 RC Pack',
        rcTotal: 50,
        rcRemaining: 50,
        priceGbp: '4.99',
        purchasedAt: now,
        expiresAt: future,
        userId: 'user-1',
        stripePaymentIntentId: 'pi_1',
      },
      {
        id: 'pack-2',
        packName: '100 RC Pack',
        rcTotal: 100,
        rcRemaining: 80,
        priceGbp: '8.99',
        purchasedAt: new Date(now.getTime() - 86400000),
        expiresAt: future,
        userId: 'user-1',
        stripePaymentIntentId: 'pi_2',
      },
    ])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : historyQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/history',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      purchases: [
        {
          id: expect.any(String),
          packName: expect.any(String),
          rcTotal: expect.any(Number),
          priceGbp: expect.any(String),
          purchasedAt: expect.any(String),
          expiresAt: expect.any(String),
        },
        {
          id: expect.any(String),
          packName: expect.any(String),
          rcTotal: expect.any(Number),
          priceGbp: expect.any(String),
          purchasedAt: expect.any(String),
          expiresAt: expect.any(String),
        },
      ],
      nextCursor: null,
    })
  })

  it('Matches snapshot for paginated result with nextCursor', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 86400000 * 365)

    // Return limit+1 rows (default limit=20, so 21) to trigger nextCursor.
    // We'll use limit=1 in querystring so we need 2 rows returned.
    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const historyQuery = createChainableQuery([
      {
        id: 'pack-1',
        packName: '50 RC Pack',
        rcTotal: 50,
        rcRemaining: 50,
        priceGbp: '4.99',
        purchasedAt: now,
        expiresAt: future,
        userId: 'user-1',
        stripePaymentIntentId: 'pi_1',
      },
      {
        id: 'pack-2',
        packName: '100 RC Pack',
        rcTotal: 100,
        rcRemaining: 100,
        priceGbp: '8.99',
        purchasedAt: new Date(now.getTime() - 86400000),
        expiresAt: future,
        userId: 'user-1',
        stripePaymentIntentId: 'pi_2',
      },
    ])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : historyQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/history?limit=1',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      purchases: [
        {
          id: expect.any(String),
          packName: expect.any(String),
          rcTotal: expect.any(Number),
          priceGbp: expect.any(String),
          purchasedAt: expect.any(String),
          expiresAt: expect.any(String),
        },
      ],
      nextCursor: expect.any(String),
    })
  })

  it('Matches snapshot for empty purchase history', async () => {
    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const historyQuery = createChainableQuery([])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : historyQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/history',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      purchases: [],
      nextCursor: null,
    })
  })
})
