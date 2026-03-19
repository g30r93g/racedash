import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'
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

describe('POST /api/stripe/checkout', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(stripeRoutes)
  })

  afterAll(async () => {
    await app.close()
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

  it.todo('Returns 401 when not authenticated')

  // ── Integration tests requiring DB + Stripe mocking ──────────────────

  it.todo('Creates Stripe Checkout session for \'plus\' tier and returns checkout URL')

  it.todo('Creates Stripe Checkout session for \'pro\' tier and returns checkout URL')

  it.todo('Sets automatic_tax: { enabled: true }')

  it.todo('Creates Stripe Customer when user has no stripe_customer_id')

  it.todo('Reuses existing stripe_customer_id')

  it.todo('Returns 409 when user already has active subscription')
})
