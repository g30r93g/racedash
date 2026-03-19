import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createUnauthenticatedTestApp } from '../helpers/test-app'
import webhooksStripeRoutes from '../../src/routes/webhooks-stripe'

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
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn(() => {
        throw new Error('Invalid signature')
      }),
    },
  })),
}))

vi.mock('../../src/lib/webhook-idempotency', () => ({
  licenseExistsForSubscription: vi.fn().mockResolvedValue(false),
  creditPackExistsForPaymentIntent: vi.fn().mockResolvedValue(false),
}))

describe('POST /api/webhooks/stripe', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // Set the required env var before creating the app
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'

    // Webhook routes are excluded from Clerk auth, so use unauthenticated app
    app = await createUnauthenticatedTestApp(webhooksStripeRoutes)
  })

  afterAll(async () => {
    await app.close()
    delete process.env.STRIPE_WEBHOOK_SECRET
  })

  // ── Signature validation tests (real tests) ──────────────────────────

  it('Returns 400 for missing Stripe signature header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      payload: { type: 'customer.subscription.created' },
      // No stripe-signature header
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
    expect(body.error.message).toContain('Missing stripe-signature header')
  })

  it('Returns 400 for invalid Stripe signature', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      payload: { type: 'customer.subscription.created' },
      headers: {
        'stripe-signature': 't=12345,v1=bad_signature',
      },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
    expect(body.error.message).toContain('Webhook signature verification failed')
  })

  // ── Subscription lifecycle (require DB + Stripe mocking) ─────────────

  it.todo('Creates license row on customer.subscription.created')

  it.todo('Derives correct tier from Stripe Price ID')

  it.todo('Sets license status to \'active\' on creation')

  it.todo('Stores stripe_customer_id and stripe_subscription_id on license')

  it.todo('Updates license tier/status/dates on customer.subscription.updated')

  it.todo('Maps past_due subscription status to \'expired\' license status')

  it.todo('Sets license status to \'cancelled\' on customer.subscription.deleted')

  // ── Credit pack creation ─────────────────────────────────────────────

  it.todo('Creates credit pack on checkout.session.completed with metadata.type === \'credit_pack\'')

  it.todo('Sets credit pack expires_at to 12 months from purchase')

  it.todo('Sets rc_total and rc_remaining to metadata.pack_size')

  it.todo('Ignores checkout.session.completed without metadata.type === \'credit_pack\'')

  // ── Idempotency ──────────────────────────────────────────────────────

  it.todo('Skips duplicate events (idempotent via DB constraints)')

  it.todo('Skips duplicate subscription creation')

  it.todo('Skips duplicate credit pack')

  // ── Success response ─────────────────────────────────────────────────

  it.todo('Returns { received: true } for all successfully processed events')
})
