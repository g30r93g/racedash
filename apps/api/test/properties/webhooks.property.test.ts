import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { FastifyInstance } from 'fastify'
import { createUnauthenticatedTestApp } from '../helpers/test-app'
import webhooksStripeRoutes from '../../src/routes/webhooks-stripe'
import { getStripe } from '../../src/lib/stripe'
import { getDb } from '../../src/lib/db'
import { tierFromPriceId } from '../../src/lib/stripe-prices'
import { licenseExistsForSubscription, creditPackExistsForPaymentIntent } from '../../src/lib/webhook-idempotency'

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

const mockConstructEvent = vi.fn()

function setupStripe() {
  vi.mocked(getStripe).mockReturnValue({
    webhooks: { constructEvent: mockConstructEvent },
  } as any)
}

function createMockDb(opts: {
  selectResult?: any[]
  insertFn?: vi.Mock
  updateFn?: vi.Mock
} = {}) {
  const { selectResult = [], insertFn, updateFn } = opts

  return {
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
}

function injectWebhook(app: FastifyInstance) {
  return app.inject({
    method: 'POST',
    url: '/api/webhooks/stripe',
    payload: {},
    headers: { 'stripe-signature': 't=12345,v1=fake_sig' },
  })
}

describe('Webhook idempotency properties', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    setupStripe()
    app = await createUnauthenticatedTestApp(webhooksStripeRoutes)
  })

  it('Webhook idempotency', async () => {
    // Replaying the same subscription.created event K times should only attempt insert once
    // (the first call), and subsequent calls are skipped by the idempotency check.
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 10 }),
        async (replayCount) => {
          vi.clearAllMocks()
          setupStripe()

          const insertValues = vi.fn().mockResolvedValue(undefined)
          const mockDb = createMockDb({
            selectResult: [{ id: 'user_1' }],
            insertFn: insertValues,
          })
          vi.mocked(getDb).mockReturnValue(mockDb as any)
          vi.mocked(tierFromPriceId).mockReturnValue('pro')

          const event = {
            type: 'customer.subscription.created',
            data: {
              object: {
                id: 'sub_idem_test',
                customer: 'cus_123',
                status: 'active',
                items: {
                  data: [{
                    price: { id: 'price_test_pro' },
                    current_period_start: 1700000000,
                    current_period_end: 1731536000,
                  }],
                },
              },
            },
          }

          // First delivery: idempotency check returns false (not yet processed)
          vi.mocked(licenseExistsForSubscription).mockResolvedValueOnce(false)
          mockConstructEvent.mockReturnValueOnce(event)
          const first = await injectWebhook(app)
          expect(first.statusCode).toBe(200)

          // Subsequent deliveries: idempotency check returns true (already processed)
          for (let i = 1; i < replayCount; i++) {
            vi.mocked(licenseExistsForSubscription).mockResolvedValueOnce(true)
            mockConstructEvent.mockReturnValueOnce(event)
            const response = await injectWebhook(app)
            expect(response.statusCode).toBe(200)
            expect(response.json()).toEqual({ received: true })
          }

          // Insert should have been called exactly once (on the first delivery)
          expect(insertValues).toHaveBeenCalledTimes(1)
        },
      ),
      { numRuns: 20 },
    )
  })
})

describe('Subscription lifecycle properties', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    setupStripe()
    app = await createUnauthenticatedTestApp(webhooksStripeRoutes)
  })

  it('Subscription lifecycle consistency', async () => {
    // For any Stripe subscription status, the mapped license status is always
    // one of the three valid values: 'active', 'expired', or 'cancelled'
    const arbStripeStatus = fc.constantFrom(
      'active', 'trialing', 'past_due', 'unpaid',
      'canceled', 'incomplete_expired', 'incomplete', 'paused',
    )

    await fc.assert(
      fc.asyncProperty(arbStripeStatus, async (stripeStatus) => {
        vi.clearAllMocks()
        setupStripe()

        const updateWhere = vi.fn().mockResolvedValue(undefined)
        const mockDb = createMockDb({
          selectResult: [{ id: 'lic_1', tier: 'pro' }],
          updateFn: updateWhere,
        })
        vi.mocked(getDb).mockReturnValue(mockDb as any)
        vi.mocked(tierFromPriceId).mockReturnValue('pro')

        mockConstructEvent.mockReturnValueOnce({
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_lifecycle',
              customer: 'cus_123',
              status: stripeStatus,
              items: {
                data: [{
                  price: { id: 'price_test_pro' },
                  current_period_start: 1700000000,
                  current_period_end: 1731536000,
                }],
              },
            },
          },
        })

        const response = await injectWebhook(app)
        expect(response.statusCode).toBe(200)

        // Verify the status set on the license is one of the valid values
        const setMock = mockDb.update.mock.results[0].value.set
        const setCall = setMock.mock.calls[0][0]
        expect(['active', 'expired', 'cancelled']).toContain(setCall.status)
      }),
      { numRuns: 30 },
    )
  })
})

describe('Unknown event safety properties', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    setupStripe()
    app = await createUnauthenticatedTestApp(webhooksStripeRoutes)
  })

  it('Unknown events are safe', async () => {
    // Any unknown event type should be silently ignored and return { received: true }
    const arbUnknownEventType = fc.string({ minLength: 3, maxLength: 50 }).filter(
      s => !['customer.subscription.created', 'customer.subscription.updated',
        'customer.subscription.deleted', 'checkout.session.completed'].includes(s),
    )

    await fc.assert(
      fc.asyncProperty(arbUnknownEventType, async (eventType) => {
        vi.clearAllMocks()
        setupStripe()

        const insertValues = vi.fn()
        const mockDb = createMockDb({ insertFn: insertValues })
        vi.mocked(getDb).mockReturnValue(mockDb as any)

        mockConstructEvent.mockReturnValueOnce({
          type: eventType,
          data: { object: {} },
        })

        const response = await injectWebhook(app)

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ received: true })
        // No DB writes should occur for unknown events
        expect(insertValues).not.toHaveBeenCalled()
      }),
      { numRuns: 50 },
    )
  })
})
