import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createUnauthenticatedTestApp } from '../helpers/test-app'
import webhooksStripeRoutes from '../../src/routes/webhooks-stripe'

// Mock @racedash/db
vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email', stripeCustomerId: 'stripeCustomerId' },
  licenses: {
    id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt',
    tier: 'tier', stripeSubscriptionId: 'stripeSubscriptionId', stripeCustomerId: 'stripeCustomerId',
    startsAt: 'startsAt', updatedAt: 'updatedAt',
  },
  creditPacks: {
    id: 'id', userId: 'userId', stripePaymentIntentId: 'stripePaymentIntentId',
    packName: 'packName', rcTotal: 'rcTotal', rcRemaining: 'rcRemaining',
    priceGbp: 'priceGbp', purchasedAt: 'purchasedAt', expiresAt: 'expiresAt',
  },
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
  tierFromPriceId: vi.fn((priceId: string) => {
    if (priceId === 'price_plus') return 'plus'
    if (priceId === 'price_pro') return 'pro'
    return null
  }),
}))

vi.mock('../../src/lib/webhook-idempotency', () => ({
  licenseExistsForSubscription: vi.fn().mockResolvedValue(false),
  creditPackExistsForPaymentIntent: vi.fn().mockResolvedValue(false),
}))

import { getDb } from '../../src/lib/db'
import { getStripe } from '../../src/lib/stripe'
import { licenseExistsForSubscription, creditPackExistsForPaymentIntent } from '../../src/lib/webhook-idempotency'

const mockGetDb = vi.mocked(getDb)
const mockGetStripe = vi.mocked(getStripe)
const mockLicenseExists = vi.mocked(licenseExistsForSubscription)
const mockCreditPackExists = vi.mocked(creditPackExistsForPaymentIntent)

function createChainableQuery(rows: unknown[] = []) {
  const chain: Record<string, any> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.from = vi.fn().mockReturnValue(chain)
  chain.where = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockResolvedValue(rows)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.set = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.values = vi.fn().mockResolvedValue(undefined)
  chain.then = (resolve: (v: unknown) => void) => resolve(rows)
  return chain
}

function mockStripeWithEvent(event: Record<string, any>) {
  const stripe = {
    webhooks: {
      constructEvent: vi.fn().mockReturnValue(event),
    },
  }
  mockGetStripe.mockReturnValue(stripe as any)
  return stripe
}

describe('Stripe webhook response snapshots', () => {
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
    mockLicenseExists.mockResolvedValue(false)
    mockCreditPackExists.mockResolvedValue(false)
  })

  it('Matches snapshot for subscription.created license row', async () => {
    mockStripeWithEvent({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_new_123',
          customer: 'cus_123',
          status: 'active',
          items: {
            data: [
              {
                price: { id: 'price_plus' },
                current_period_start: Math.floor(Date.now() / 1000),
                current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
              },
            ],
          },
        },
      },
    })

    const insertValues = vi.fn().mockResolvedValue(undefined)
    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: insertValues,
      }),
    }
    mockGetDb.mockReturnValue(dbMock as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 't=12345,v1=valid' },
      payload: { type: 'customer.subscription.created' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ received: true })

    // Verify the inserted license row shape
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: expect.any(String),
        tier: expect.stringMatching(/^(plus|pro)$/),
        stripeCustomerId: expect.any(String),
        stripeSubscriptionId: expect.any(String),
        status: 'active',
        startsAt: expect.any(Date),
        expiresAt: expect.any(Date),
      }),
    )
  })

  it('Matches snapshot for subscription.updated license row', async () => {
    mockStripeWithEvent({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_existing_123',
          customer: 'cus_123',
          status: 'active',
          items: {
            data: [
              {
                price: { id: 'price_pro' },
                current_period_start: Math.floor(Date.now() / 1000),
                current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
              },
            ],
          },
        },
      },
    })

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    })
    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: 'lic-1',
                userId: 'user-1',
                tier: 'plus',
                status: 'active',
                stripeSubscriptionId: 'sub_existing_123',
              },
            ]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: setMock,
      }),
    }
    mockGetDb.mockReturnValue(dbMock as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 't=12345,v1=valid' },
      payload: { type: 'customer.subscription.updated' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ received: true })

    // Verify the update shape
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: expect.stringMatching(/^(plus|pro)$/),
        status: expect.stringMatching(/^(active|expired|cancelled)$/),
        startsAt: expect.any(Date),
        expiresAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    )
  })

  it('Matches snapshot for subscription.deleted licence row', async () => {
    mockStripeWithEvent({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_del_123',
          customer: 'cus_123',
          status: 'canceled',
        },
      },
    })

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    })
    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'lic-1' }]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: setMock,
      }),
    }
    mockGetDb.mockReturnValue(dbMock as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 't=12345,v1=valid' },
      payload: { type: 'customer.subscription.deleted' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ received: true })

    // Verify cancellation shape
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
        updatedAt: expect.any(Date),
      }),
    )
  })

  it('Matches snapshot for checkout.session.completed credit pack row', async () => {
    mockStripeWithEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_completed_123',
          customer: 'cus_123',
          payment_status: 'paid',
          payment_intent: 'pi_credit_123',
          amount_total: 499,
          metadata: {
            type: 'credit_pack',
            pack_size: '50',
            user_id: 'user-1',
          },
        },
      },
    })

    const insertValues = vi.fn().mockResolvedValue(undefined)
    const dbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: insertValues,
      }),
    }
    mockGetDb.mockReturnValue(dbMock as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 't=12345,v1=valid' },
      payload: { type: 'checkout.session.completed' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ received: true })

    // Verify the inserted credit pack row shape
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: expect.any(String),
        packName: expect.any(String),
        rcTotal: expect.any(Number),
        rcRemaining: expect.any(Number),
        priceGbp: expect.any(String),
        purchasedAt: expect.any(Date),
        expiresAt: expect.any(Date),
        stripePaymentIntentId: expect.any(String),
      }),
    )
  })

  it('Matches snapshot for { received: true } acknowledgement', async () => {
    // An unhandled event type should still return { received: true }
    mockStripeWithEvent({
      type: 'invoice.paid',
      data: { object: {} },
    })

    mockGetDb.mockReturnValue({} as any)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: { 'stripe-signature': 't=12345,v1=valid' },
      payload: { type: 'invoice.paid' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      received: true,
    })
  })
})
