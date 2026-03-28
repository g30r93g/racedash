import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'

process.env.CLERK_SECRET_KEY = 'sk_test_fake'

const { mockVerifyToken } = vi.hoisted(() => {
  const mockVerifyToken = vi.fn()
  return { mockVerifyToken }
})

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

import clerkAuth from '../../src/plugins/clerk-auth'

async function createClerkTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  await app.register(clerkAuth)

  // Test route to verify request.clerk is populated
  app.get('/api/test', async (request) => {
    return { clerk: request.clerk }
  })

  // Health route (excluded from auth)
  app.get('/api/health', async () => {
    return { status: 'ok' }
  })

  // Webhooks route (excluded from auth)
  app.post('/api/webhooks/clerk', async () => {
    return { received: true }
  })

  await app.ready()
  return app
}

describe('clerk-auth middleware', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createClerkTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects request with no Authorization header → 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
  })

  it('rejects request with malformed Bearer token → 401', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Invalid token'))

    const response = await app.inject({
      method: 'GET',
      url: '/api/test',
      headers: { authorization: 'Bearer invalid' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('SESSION_EXPIRED')
  })

  it('rejects request with expired JWT → 401', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Token has expired'))

    const response = await app.inject({
      method: 'GET',
      url: '/api/test',
      headers: { authorization: 'Bearer expired.jwt.token' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('SESSION_EXPIRED')
  })

  it('allows request with valid JWT, populates request.clerk', async () => {
    mockVerifyToken.mockResolvedValueOnce({
      sub: 'user_abc123',
      sid: 'sess_xyz789',
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/test',
      headers: { authorization: 'Bearer valid.jwt.token' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.clerk.userId).toBe('user_abc123')
    expect(body.clerk.sessionId).toBe('sess_xyz789')
  })

  it('skips auth for GET /api/health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('ok')
  })

  it('skips auth for POST /api/webhooks/clerk', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      payload: {},
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().received).toBe(true)
  })
})
