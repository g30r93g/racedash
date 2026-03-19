import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'
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

describe('POST /api/stripe/credits/checkout', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(stripeCreditRoutes)
  })

  afterAll(async () => {
    await app.close()
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

  it.todo('Creates Checkout session in payment mode for valid pack size')

  it.todo('Includes type: \'credit_pack\' and pack_size in session metadata')

  it.todo('Sets automatic_tax: { enabled: true }')

  it.todo('Returns 403 when user has no active license')

  it.todo('Returns 401 when not authenticated')
})
