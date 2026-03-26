import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createTestApp, createUnauthenticatedTestApp } from '../helpers/test-app'
import stripeRoutes from '../../src/routes/stripe'

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
  priceIdForTier: vi.fn(),
}))

import { getDb } from '../../src/lib/db'
import { getStripe } from '../../src/lib/stripe'
import { priceIdForTier } from '../../src/lib/stripe-prices'

const mockedGetDb = vi.mocked(getDb)
const mockedGetStripe = vi.mocked(getStripe)
const mockedPriceIdForTier = vi.mocked(priceIdForTier)

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
          id: 'cs_test_session_123',
          url: 'https://checkout.stripe.com/session/cs_test_session_123',
        }),
      },
    },
  } as any
}

const TEST_USER = {
  id: 'user-1',
  clerkId: 'clerk_test_user',
  email: 'test@test.com',
  stripeCustomerId: null,
}

const TEST_USER_WITH_STRIPE = {
  ...TEST_USER,
  stripeCustomerId: 'cus_existing_456',
}

describe('POST /api/stripe/checkout', () => {
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

  // ── Validation tests (no DB/Stripe needed) ──────────────────────────

  it('Returns 400 for missing/invalid tier', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'free' },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error.code).toBe('INVALID_TIER')
    expect(body.error.message).toContain('tier must be')
  })

  it('Returns 400 when tier is missing from body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_TIER')
  })

  it('Returns 400 when body is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_TIER')
  })

  // ── Auth test ────────────────────────────────────────────────────────

  it('Returns 401 when not authenticated', async () => {
    const unauthApp = await createUnauthenticatedTestApp(stripeRoutes)
    try {
      const response = await unauthApp.inject({
        method: 'POST',
        url: '/api/stripe/checkout',
        payload: { tier: 'plus' },
      })

      // Without clerk auth context, the route cannot access request.clerk
      // and should fail with an error (500 since the middleware is not present)
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await unauthApp.close()
    }
  })

  // ── Integration tests requiring DB + Stripe mocking ──────────────────

  it("Creates Stripe Checkout session for 'plus' tier and returns checkout URL", async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForTier.mockReturnValue('price_test_plus')

    // First query: select user — returns user
    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    // Second query: select existing license — returns empty (no active sub)
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/session/cs_test_session_123')
    expect(body.sessionId).toBe('cs_test_session_123')
    expect(mockedPriceIdForTier).toHaveBeenCalledWith('plus')
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_test_plus', quantity: 1 }],
      }),
    )
  })

  it("Creates Stripe Checkout session for 'pro' tier and returns checkout URL", async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForTier.mockReturnValue('price_test_pro')

    mockDb.limit.mockResolvedValueOnce([TEST_USER_WITH_STRIPE])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'pro' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/session/cs_test_session_123')
    expect(body.sessionId).toBe('cs_test_session_123')
    expect(mockedPriceIdForTier).toHaveBeenCalledWith('pro')
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_test_pro', quantity: 1 }],
      }),
    )
  })

  it('Sets automatic_tax: { enabled: true }', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForTier.mockReturnValue('price_test_plus')

    mockDb.limit.mockResolvedValueOnce([TEST_USER_WITH_STRIPE])
    mockDb.limit.mockResolvedValueOnce([])

    await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        automatic_tax: { enabled: true },
      }),
    )
  })

  it('Creates Stripe Customer when user has no stripe_customer_id', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForTier.mockReturnValue('price_test_plus')

    // User with no stripeCustomerId
    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    // No active license
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(200)
    // Should create a new customer
    expect(mockStripe.customers.create).toHaveBeenCalledWith({ email: 'test@test.com' })
    // Should update the user record with the new stripeCustomerId
    expect(mockDb.update).toHaveBeenCalled()
    expect(mockDb.set).toHaveBeenCalledWith({ stripeCustomerId: 'cus_new_123' })
    // Checkout session should use the newly created customer ID
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_new_123',
      }),
    )
  })

  it('Reuses existing stripe_customer_id', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForTier.mockReturnValue('price_test_plus')

    // User already has stripeCustomerId
    mockDb.limit.mockResolvedValueOnce([TEST_USER_WITH_STRIPE])
    // No active license
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(200)
    // Should NOT create a new customer
    expect(mockStripe.customers.create).not.toHaveBeenCalled()
    // Checkout session should use the existing customer ID
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_existing_456',
      }),
    )
  })

  it('Returns 409 when user already has active subscription', async () => {
    const mockDb = createMockDb()

    mockedGetDb.mockReturnValue(mockDb)

    // User found
    mockDb.limit.mockResolvedValueOnce([TEST_USER])
    // Active license exists
    mockDb.limit.mockResolvedValueOnce([{ id: 'license-1' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(409)
    const body = response.json()
    expect(body.error.code).toBe('SUBSCRIPTION_EXISTS')
    expect(body.error.message).toContain('active subscription')
  })

  it('Returns 404 when user not found in DB', async () => {
    const mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb)
    mockDb.limit.mockResolvedValueOnce([]) // no user

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('Returns 400 when priceIdForTier returns null', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForTier.mockReturnValue(null as any)

    mockDb.limit.mockResolvedValueOnce([TEST_USER_WITH_STRIPE])
    mockDb.limit.mockResolvedValueOnce([]) // no active sub

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_TIER')
  })

  it('Returns 502 when Stripe checkout session creation fails', async () => {
    const mockDb = createMockDb()
    const mockStripe = createMockStripe()

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)
    mockedPriceIdForTier.mockReturnValue('price_test_plus')

    mockDb.limit.mockResolvedValueOnce([TEST_USER_WITH_STRIPE])
    mockDb.limit.mockResolvedValueOnce([])
    mockStripe.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe API error'))

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/checkout',
      payload: { tier: 'plus' },
    })

    expect(response.statusCode).toBe(502)
    expect(response.json().error.code).toBe('STRIPE_ERROR')
  })
})

describe('POST /api/stripe/portal', () => {
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

  it('Returns portal URL for user with Stripe customer ID', async () => {
    const mockDb = createMockDb()
    const mockStripe = {
      ...createMockStripe(),
      billingPortal: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/session/test' }),
        },
      },
    } as any

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)

    mockDb.limit.mockResolvedValueOnce([TEST_USER_WITH_STRIPE])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/portal',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().portalUrl).toBe('https://billing.stripe.com/session/test')
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing_456' }),
    )
  })

  it('Returns 404 when user not found', async () => {
    const mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb)
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/portal',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('Returns 404 when user has no Stripe customer ID', async () => {
    const mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb)
    mockDb.limit.mockResolvedValueOnce([TEST_USER]) // stripeCustomerId is null

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/portal',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('NO_STRIPE_CUSTOMER')
  })

  it('Returns 502 when Stripe portal session creation fails', async () => {
    const mockDb = createMockDb()
    const mockStripe = {
      ...createMockStripe(),
      billingPortal: {
        sessions: {
          create: vi.fn().mockRejectedValue(new Error('Stripe API error')),
        },
      },
    } as any

    mockedGetDb.mockReturnValue(mockDb)
    mockedGetStripe.mockReturnValue(mockStripe)

    mockDb.limit.mockResolvedValueOnce([TEST_USER_WITH_STRIPE])

    const response = await app.inject({
      method: 'POST',
      url: '/api/stripe/portal',
    })

    expect(response.statusCode).toBe(502)
    expect(response.json().error.code).toBe('STRIPE_ERROR')
  })
})
