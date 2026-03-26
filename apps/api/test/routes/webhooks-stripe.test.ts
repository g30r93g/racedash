import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createUnauthenticatedTestApp } from '../helpers/test-app'
import webhooksStripeRoutes from '../../src/routes/webhooks-stripe'
import { getStripe } from '../../src/lib/stripe'
import { getDb } from '../../src/lib/db'
import { tierFromPriceId } from '../../src/lib/stripe-prices'
import { licenseExistsForSubscription, creditPackExistsForPaymentIntent } from '../../src/lib/webhook-idempotency'

// Mock @racedash/db to avoid resolving the real package (no DB in tests)
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', stripeCustomerId: 'stripeCustomerId' },
  licenses: {
    id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt',
    tier: 'tier', stripeSubscriptionId: 'stripeSubscriptionId', stripeCustomerId: 'stripeCustomerId',
  },
  creditPacks: {
    id: 'id', userId: 'userId', stripePaymentIntentId: 'stripePaymentIntentId',
  },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
}))

// Mock the DB, Stripe, and idempotency modules
vi.mock('../../src/lib/db', () => ({
  getDb: vi.fn(),
}))

vi.mock('../../src/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('../../src/lib/stripe-prices', () => ({
  tierFromPriceId: vi.fn(),
}))

vi.mock('../../src/lib/webhook-idempotency', () => ({
  licenseExistsForSubscription: vi.fn().mockResolvedValue(false),
  creditPackExistsForPaymentIntent: vi.fn().mockResolvedValue(false),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

const mockConstructEvent = vi.fn()

function setupStripe() {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
  } as any)
}

function makeSubscriptionEvent(
  type: 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted',
  overrides: Record<string, any> = {},
) {
  return {
    type,
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        items: {
          data: [{
            price: { id: 'price_test_pro' },
            current_period_start: 1700000000,
            current_period_end: 1731536000,
          }],
        },
        ...overrides,
      },
    },
  }
}

function makeCheckoutSessionEvent(overrides: Record<string, any> = {}) {
  return {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_123',
        customer: 'cus_123',
        payment_status: 'paid',
        payment_intent: 'pi_123',
        amount_total: 2500,
        metadata: {
          type: 'credit_pack',
          pack_size: '100',
        },
        ...overrides,
      },
    },
  }
}

/** Creates a chainable mock DB query builder */
function createMockDb(opts: {
  selectResult?: any[]
  insertFn?: vi.Mock
  updateFn?: vi.Mock
} = {}) {
  const { selectResult = [], insertFn, updateFn } = opts

  const chainable = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(selectResult),
    insert: vi.fn().mockReturnValue({
      values: insertFn ?? vi.fn().mockResolvedValue(undefined),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: updateFn ?? vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }

  return chainable
}

function injectWebhook(app: FastifyInstance) {
  return app.inject({
    method: 'POST',
    url: '/api/webhooks/stripe',
    payload: {},
    headers: { 'stripe-signature': 't=12345,v1=fake_sig' },
  })
}

describe('POST /api/webhooks/stripe', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
    app = await createUnauthenticatedTestApp(webhooksStripeRoutes)
  })

  afterAll(async () => {
    await app.close()
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  beforeEach(() => {
    vi.clearAllMocks()
    setupStripe()
    vi.mocked(licenseExistsForSubscription).mockResolvedValue(false)
    vi.mocked(creditPackExistsForPaymentIntent).mockResolvedValue(false)
  })

  // ── Signature validation tests ──────────────────────────────────────────

  it('Returns 400 for missing Stripe signature header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      payload: { type: 'customer.subscription.created' },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
    expect(body.error.message).toContain('Missing stripe-signature header')
  })

  it('Returns 400 for invalid Stripe signature', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('Invalid signature')
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      payload: { type: 'customer.subscription.created' },
      headers: { 'stripe-signature': 't=12345,v1=bad_signature' },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
    expect(body.error.message).toContain('Webhook signature verification failed')
  })

  // ── Subscription lifecycle ─────────────────────────────────────────────

  it('Creates license row on customer.subscription.created', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        tier: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      }),
    )
  })

  it('Derives correct tier from Stripe Price ID', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('plus')
    mockConstructEvent.mockReturnValueOnce(
      makeSubscriptionEvent('customer.subscription.created', {
        items: { data: [{ price: { id: 'price_test_plus' }, current_period_start: 1700000000, current_period_end: 1731536000 }] },
      }),
    )

    await injectWebhook(app)

    expect(tierFromPriceId).toHaveBeenCalledWith('price_test_plus')
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'plus' }),
    )
  })

  it("Sets license status to 'active' on creation", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    await injectWebhook(app)

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    )
  })

  it('Stores stripe_customer_id and stripe_subscription_id on license', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    await injectWebhook(app)

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      }),
    )
  })

  it('Updates license tier/status/dates on customer.subscription.updated', async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'lic_1', tier: 'plus' }],
      updateFn: updateWhere,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.updated'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    // The update chain: db.update(licenses).set({...}).where(...)
    const setMock = mockDb.update.mock.results[0].value.set
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'pro',
        status: 'active',
        startsAt: expect.any(Date),
        expiresAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
  })

  it("Maps past_due subscription status to 'expired' license status", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'lic_1', tier: 'pro' }],
      updateFn: updateWhere,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(
      makeSubscriptionEvent('customer.subscription.updated', { status: 'past_due' }),
    )

    await injectWebhook(app)

    const setMock = mockDb.update.mock.results[0].value.set
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'expired' }),
    )
  })

  it("Sets license status to 'cancelled' on customer.subscription.deleted", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'lic_1' }],
      updateFn: updateWhere,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.deleted'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    const setMock = mockDb.update.mock.results[0].value.set
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
    )
  })

  // ── Credit pack creation ─────────────────────────────────────────────

  it("Creates credit pack on checkout.session.completed with metadata.type === 'credit_pack'", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(makeCheckoutSessionEvent())

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        packName: '100 RC Pack',
        rcTotal: 100,
        rcRemaining: 100,
        stripePaymentIntentId: 'pi_123',
      }),
    )
  })

  it('Sets credit pack expires_at to 12 months from purchase', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(makeCheckoutSessionEvent())

    const beforeNow = new Date()
    await injectWebhook(app)
    const afterNow = new Date()

    const callArgs = insertValues.mock.calls[0][0]
    const expiresAt: Date = callArgs.expiresAt
    const purchasedAt: Date = callArgs.purchasedAt

    // expiresAt should be approximately 1 year after purchasedAt
    const expectedYear = purchasedAt.getFullYear() + 1
    expect(expiresAt.getFullYear()).toBe(expectedYear)
    expect(expiresAt.getMonth()).toBe(purchasedAt.getMonth())
    expect(expiresAt.getDate()).toBe(purchasedAt.getDate())
  })

  it('Sets rc_total and rc_remaining to metadata.pack_size', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutSessionEvent({ metadata: { type: 'credit_pack', pack_size: '250' } }),
    )

    await injectWebhook(app)

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        rcTotal: 250,
        rcRemaining: 250,
      }),
    )
  })

  it("Ignores checkout.session.completed without metadata.type === 'credit_pack'", async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutSessionEvent({ metadata: { type: 'subscription' } }),
    )

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
    expect(insertValues).not.toHaveBeenCalled()
  })

  // ── Idempotency ────────────────────────────────────────────────────────

  it('Skips duplicate events (idempotent via DB constraints)', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    vi.mocked(licenseExistsForSubscription).mockResolvedValue(true)
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Skips duplicate subscription creation', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    vi.mocked(licenseExistsForSubscription).mockResolvedValue(true)
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(licenseExistsForSubscription).toHaveBeenCalledWith(expect.anything(), 'sub_123')
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Skips duplicate credit pack', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({
      selectResult: [{ id: 'user_1' }],
      insertFn: insertValues,
    })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(creditPackExistsForPaymentIntent).mockResolvedValue(true)
    mockConstructEvent.mockReturnValueOnce(makeCheckoutSessionEvent())

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(creditPackExistsForPaymentIntent).toHaveBeenCalledWith(expect.anything(), 'pi_123')
    expect(insertValues).not.toHaveBeenCalled()
  })

  // ── Edge cases: subscription.created ────────────────────────────────

  it('Skips when no user found for subscription.created', async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ selectResult: [], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Skips when unknown price ID in subscription.created', async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue(null as any)
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Handles UNIQUE constraint violation on subscription.created gracefully', async () => {
    const uniqueError = Object.assign(new Error('unique violation'), { code: '23505' })
    const insertValues = vi.fn().mockRejectedValue(uniqueError)
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
  })

  it('Rethrows non-UNIQUE errors on subscription.created', async () => {
    const otherError = new Error('connection refused')
    const insertValues = vi.fn().mockRejectedValue(otherError)
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(500)
  })

  it('Handles customer as object (not string) in subscription.created', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(
      makeSubscriptionEvent('customer.subscription.created', { customer: { id: 'cus_obj_123' } }),
    )

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: 'cus_obj_123' }),
    )
  })

  // ── Edge cases: subscription.updated ───────────────────────────────

  it('Skips when no license found for subscription.updated', async () => {
    const updateFn = vi.fn()
    const mockDb = createMockDb({ selectResult: [], updateFn })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.updated'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(updateFn).not.toHaveBeenCalled()
  })

  // ── Edge cases: subscription.deleted ───────────────────────────────

  it('Skips when no license found for subscription.deleted', async () => {
    const updateFn = vi.fn()
    const mockDb = createMockDb({ selectResult: [], updateFn })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.deleted'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(updateFn).not.toHaveBeenCalled()
  })

  // ── Edge cases: checkout.session.completed ─────────────────────────

  it('Skips checkout.session.completed when payment_status is not paid', async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutSessionEvent({ payment_status: 'unpaid' }),
    )

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Skips checkout.session.completed when no customer', async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutSessionEvent({ customer: null }),
    )

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Skips checkout.session.completed when no user found for customer', async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ selectResult: [], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(makeCheckoutSessionEvent())

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Skips checkout.session.completed when pack_size is invalid', async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutSessionEvent({ metadata: { type: 'credit_pack', pack_size: '0' } }),
    )

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Skips checkout.session.completed when no payment_intent', async () => {
    const insertValues = vi.fn()
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutSessionEvent({ payment_intent: null }),
    )

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).not.toHaveBeenCalled()
  })

  it('Handles customer as object in checkout.session.completed', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutSessionEvent({ customer: { id: 'cus_obj_456' } }),
    )

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(insertValues).toHaveBeenCalled()
  })

  it('Handles UNIQUE constraint violation on credit pack insert gracefully', async () => {
    const uniqueError = Object.assign(new Error('unique violation'), { code: '23505' })
    const insertValues = vi.fn().mockRejectedValue(uniqueError)
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }], insertFn: insertValues })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce(makeCheckoutSessionEvent())

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
  })

  // ── Unhandled event types ──────────────────────────────────────────

  it('Returns { received: true } for unknown event types', async () => {
    const mockDb = createMockDb()
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    mockConstructEvent.mockReturnValueOnce({ type: 'invoice.paid', data: { object: {} } })

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
  })

  // ── Success response ───────────────────────────────────────────────────

  it('Returns { received: true } for all successfully processed events', async () => {
    const mockDb = createMockDb({ selectResult: [{ id: 'user_1' }] })
    vi.mocked(getDb).mockReturnValue(mockDb as any)
    vi.mocked(tierFromPriceId).mockReturnValue('pro')
    mockConstructEvent.mockReturnValueOnce(makeSubscriptionEvent('customer.subscription.created'))

    const response = await injectWebhook(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ received: true })
  })
})
