import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'
import licenseRoutes from '../../src/routes/license'

// Mock @racedash/db
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', stripeCustomerId: 'stripeCustomerId' },
  licenses: {
    id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt',
    tier: 'tier', stripeSubscriptionId: 'stripeSubscriptionId', stripeCustomerId: 'stripeCustomerId',
    startsAt: 'startsAt',
  },
  getSlotLimit: vi.fn((tier: string) => (tier === 'plus' ? 1 : 3)),
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  desc: vi.fn(),
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

describe('License response snapshots', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(licenseRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Matches snapshot for active Plus license', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 86400000 * 30)

    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const licenseQuery = createChainableQuery([
      {
        id: 'lic-1',
        userId: 'user-1',
        tier: 'plus',
        status: 'active',
        stripeSubscriptionId: 'sub_plus_123',
        stripeCustomerId: 'cus_123',
        startsAt: now,
        expiresAt: future,
      },
    ])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : licenseQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      license: {
        tier: 'plus',
        status: 'active',
        stripeSubscriptionId: expect.any(String),
        startsAt: expect.any(String),
        expiresAt: expect.any(String),
        maxConcurrentRenders: 1,
      },
    })
  })

  it('Matches snapshot for active Pro license', async () => {
    const now = new Date()
    const future = new Date(now.getTime() + 86400000 * 30)

    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const licenseQuery = createChainableQuery([
      {
        id: 'lic-2',
        userId: 'user-1',
        tier: 'pro',
        status: 'active',
        stripeSubscriptionId: 'sub_pro_456',
        stripeCustomerId: 'cus_456',
        startsAt: now,
        expiresAt: future,
      },
    ])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : licenseQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      license: {
        tier: 'pro',
        status: 'active',
        stripeSubscriptionId: expect.any(String),
        startsAt: expect.any(String),
        expiresAt: expect.any(String),
        maxConcurrentRenders: 3,
      },
    })
  })

  it('Matches snapshot for null license (no active license)', async () => {
    const userQuery = createChainableQuery([{ id: 'user-1' }])
    const licenseQuery = createChainableQuery([])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : licenseQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'GET',
      url: '/api/license',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      license: null,
    })
  })
})
