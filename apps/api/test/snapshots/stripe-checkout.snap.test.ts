import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'
import stripeRoutes from '../../src/routes/stripe'
import stripeCreditRoutes from '../../src/routes/stripe-credits'

// Mock @racedash/db
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', stripeCustomerId: 'stripeCustomerId' },
  licenses: { id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt' },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({
  getDb: vi.fn(),
}))

vi.mock('../../src/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('../../src/lib/stripe-prices', () => ({
  priceIdForTier: vi.fn((tier: string) => `price_${tier}_test`),
  priceIdForPack: vi.fn((size: number) => (size > 0 ? `price_credits_${size}_test` : null)),
}))

import { getDb } from '../../src/lib/db'
import { getStripe } from '../../src/lib/stripe'

const mockGetDb = vi.mocked(getDb)
const mockGetStripe = vi.mocked(getStripe)

function createChainableQuery(rows: unknown[] = []) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue(rows)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.set = vi.fn().mockReturnValue(chain)
  chain.then = (resolve: (v: unknown) => void) => resolve(rows)
  return chain
}

function mockStripe() {
  const stripe = {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_new_123' }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_session_123',
          url: 'https://checkout.stripe.com/pay/cs_test_session_123',
        }),
      },
    },
  }
  mockGetStripe.mockReturnValue(stripe as any)
  return stripe
}

describe('Stripe subscription checkout response snapshots', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(stripeRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Matches snapshot for Plus tier checkout response', async () => {
    mockStripe()

    // User lookup returns user with stripeCustomerId, no active license
    const userQuery = createChainableQuery([
      { id: 'user-1', clerkId: 'clerk_test_user', email: 'test@example.com', stripeCustomerId: 'cus_existing' },
    ])
    const licenseQuery = createChainableQuery([])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : licenseQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      checkoutUrl: expect.any(String),
      sessionId: expect.any(String),
    })
  })

  it('Matches snapshot for Pro tier checkout response', async () => {
    mockStripe()

    const userQuery = createChainableQuery([
      { id: 'user-1', clerkId: 'clerk_test_user', email: 'test@example.com', stripeCustomerId: 'cus_existing' },
    ])
    const licenseQuery = createChainableQuery([])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : licenseQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'pro' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      checkoutUrl: expect.any(String),
      sessionId: expect.any(String),
    })
  })
})

describe('Stripe credit checkout response snapshots', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(stripeCreditRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Matches snapshot for 50 RC pack checkout response', async () => {
    mockStripe()

    // User with existing customer ID and active license
    const userQuery = createChainableQuery([
      { id: 'user-1', clerkId: 'clerk_test_user', email: 'test@example.com', stripeCustomerId: 'cus_existing' },
    ])
    const licenseQuery = createChainableQuery([{ id: 'lic-1' }])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : licenseQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 50 },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      checkoutUrl: expect.any(String),
      sessionId: expect.any(String),
    })
  })

  it('Matches snapshot for 500 RC pack checkout response', async () => {
    mockStripe()

    const userQuery = createChainableQuery([
      { id: 'user-1', clerkId: 'clerk_test_user', email: 'test@example.com', stripeCustomerId: 'cus_existing' },
    ])
    const licenseQuery = createChainableQuery([{ id: 'lic-1' }])

    let callCount = 0
    mockGetDb.mockReturnValue({
      select: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? userQuery : licenseQuery
      }),
    } as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 500 },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      checkoutUrl: expect.any(String),
      sessionId: expect.any(String),
    })
  })
})
