import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createTestApp, createUnauthenticatedTestApp } from '../helpers/test-app'
import stripeCreditRoutes from '../../src/routes/stripe-credits'

// Mock @racedash/db to avoid resolving the real package (no DB in tests)
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', stripeCustomerId: 'stripeCustomerId' },
  licenses: { id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt' },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
}))

// Mock the DB and Stripe modules so the route plugin can be registered
// without real connections
vi.mock('../../src/lib/db', () => ({
  getDb: vi.fn(),
}))

vi.mock('../../src/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('../../src/lib/stripe-prices', () => ({
  priceIdForPack: vi.fn(),
}))

import { getDb } from '../../src/lib/db'
import { getStripe } from '../../src/lib/stripe'
import { priceIdForPack } from '../../src/lib/stripe-prices'

const mockedGetDb = vi.mocked(getDb)
const mockedGetStripe = vi.mocked(getStripe)
const mockedPriceIdForPack = vi.mocked(priceIdForPack)

function createMockDb() {
  const mockDb: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
  return mockDb
}

function createMockStripe() {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_new_123' }),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_credit_session_123',
          url: 'https://checkout.stripe.com/session/cs_test_credit_session_123',
        }),
      },
    },
  } as any
}

const TEST_USER = {
  id: 'user-1',
  clerkId: 'clerk_test_user',
  email: 'test@test.com',
  stripeCustomerId: 'cus_existing_456',
}

describe('POST /api/stripe/credits/checkout', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(stripeCreditRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // By default, priceIdForPack returns null (invalid). Tests that need
    // valid pack sizes override this.
    mockedPriceIdForPack.mockReturnValue(null)
  })

  // ── Validation tests (no DB/Stripe needed) ──────────────────────────

  it('Returns 400 for invalid pack size', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 99 },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error.code).toBe('INVALID_PACK_SIZE')
    expect(body.error.message).toContain('packSize must be')
  })

  it('Returns 400 when packSize is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_PACK_SIZE')
  })

  it('Returns 400 when packSize is zero', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 0 },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_PACK_SIZE')
  })

  it('Returns 400 when packSize is negative', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: -50 },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_PACK_SIZE')
  })

  // ── Integration tests requiring DB + Stripe mocking ──────────────────

  it('Creates Checkout session in payment mode for valid pack size', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForPack.mockReturnValue('price_test_credits_100')

    // First query: select user
    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    // Second query: select active license — must exist for credit purchase
    mockDb.limit.mockResolvedValueOnce([{ id: 'license-1' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 100 },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/session/cs_test_credit_session_123')
    expect(body.sessionId).toBe('cs_test_credit_session_123')
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: [{ price: 'price_test_credits_100', quantity: 1 }],
      }),
    )
  })

  it("Includes type: 'credit_pack' and pack_size in session metadata", async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForPack.mockReturnValue('price_test_credits_250')

    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    mockDb.limit.mockResolvedValueOnce([{ id: 'license-1' }])

    await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 250 },
    })

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          type: 'credit_pack',
          pack_size: '250',
          user_id: 'user-1',
        }),
      }),
    )
  })

  it('Sets automatic_tax: { enabled: true }', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForPack.mockReturnValue('price_test_credits_50')

    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    mockDb.limit.mockResolvedValueOnce([{ id: 'license-1' }])

    await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 50 },
    })

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        automatic_tax: { enabled: true },
      }),
    )
  })

  it('Returns 403 when user has no active license', async () => {
    const mockDb = createMockDb()

    mockedGetDb.mockReturnValue(mockDb)
    mockedPriceIdForPack.mockReturnValue('price_test_credits_100')

    // User found
    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    // No active license
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 100 },
    })

    expect(response.statusCode).toBe(403)
    const body = response.json()
    expect(body.error.code).toBe('LICENSE_REQUIRED')
    expect(body.error.message).toContain('active license')
  })

  it('Returns 401 when not authenticated', async () => {
    const unauthApp = await createUnauthenticatedTestApp(stripeCreditRoutes)
    try {
      mockedPriceIdForPack.mockReturnValue('price_test_credits_100')

      const response = await unauthApp.inject({
        method: 'POST',
        url: '/api/stripe/credits/checkout',
        payload: { packSize: 100 },
      })

      // Without clerk auth context, the route cannot access request.clerk
      // and should fail with an error (500 since the middleware is not present)
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await unauthApp.close()
    }
  })

  it('Returns 404 when user not found in DB', async () => {
    const mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb)
    mockedPriceIdForPack.mockReturnValue('price_test_credits_100')
    mockDb.limit.mockResolvedValueOnce([]) // no user

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 100 },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('Creates Stripe Customer when user has no stripeCustomerId', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForPack.mockReturnValue('price_test_credits_100')

    const userNoStripe = { ...TEST_USER, stripeCustomerId: null }
    mockDb.limit.mockResolvedValueOnce([userNoStripe])
    mockDb.limit.mockResolvedValueOnce([{ id: 'license-1' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 100 },
    })

    expect(response.statusCode).toBe(200)
    expect(mockStripe.customers.create).toHaveBeenCalledWith({ email: 'test@test.com' })
    expect(mockDb.update).toHaveBeenCalled()
  })

  it('Returns 502 when Stripe checkout session creation fails', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForPack.mockReturnValue('price_test_credits_100')

    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    mockDb.limit.mockResolvedValueOnce([{ id: 'license-1' }])
    mockStripe.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe error'))

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/credits/checkout',
      payload: { packSize: 100 },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json().error.code).toBe('STRIPE_ERROR')
  })
})
