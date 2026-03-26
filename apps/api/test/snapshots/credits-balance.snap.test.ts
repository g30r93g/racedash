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
  },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
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

describe('Credits balance response snapshots', () => {
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

  it('Matches snapshot for user with multiple active packs', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 86400000 * 30)

    // First call: user lookup; second call: packs query
    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const packsQuery = createChainableQuery([
      {
        id: 'pack-1',
        packName: '50 RC Pack',
        rcTotal: 50,
        rcRemaining: 30,
        purchasedAt: now,
        expiresAt: future,
      },
      {
        id: 'pack-2',
        packName: '100 RC Pack',
        rcTotal: 100,
        rcRemaining: 100,
        purchasedAt: now,
        expiresAt: future,
      },
    ])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : packsQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      totalRc: expect.any(Number),
      packs: [
        {
          id: expect.any(String),
          packName: expect.any(String),
          rcTotal: expect.any(Number),
          rcRemaining: expect.any(Number),
          purchasedAt: expect.any(String),
          expiresAt: expect.any(String),
        },
        {
          id: expect.any(String),
          packName: expect.any(String),
          rcTotal: expect.any(Number),
          rcRemaining: expect.any(Number),
          purchasedAt: expect.any(String),
          expiresAt: expect.any(String),
        },
      ],
    })
  })

  it('Matches snapshot for user with no packs', async () => {
    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const packsQuery = createChainableQuery([])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : packsQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      totalRc: 0,
      packs: [],
    })
  })

  it('Matches snapshot for user with mix of expired and active packs', async () => {
    // The route filters expired packs at DB level, so only active ones come back
    const now = new Date()
    const future = new Date(now.getTime() + 86400000 * 30)

    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const packsQuery = createChainableQuery([
      {
        id: 'pack-active',
        packName: '250 RC Pack',
        rcTotal: 250,
        rcRemaining: 120,
        purchasedAt: now,
        expiresAt: future,
      },
    ])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : packsQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/credits/balance',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      totalRc: expect.any(Number),
      packs: [
        {
          id: expect.any(String),
          packName: expect.any(String),
          rcTotal: expect.any(Number),
          rcRemaining: expect.any(Number),
          purchasedAt: expect.any(String),
          expiresAt: expect.any(String),
        },
      ],
    })
  })
})
