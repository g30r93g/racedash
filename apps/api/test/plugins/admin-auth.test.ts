import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import Fastify from 'fastify'

const { mockGetUser } = vi.hoisted(() => {
  const mockGetUser = vi.fn()
  return { mockGetUser }
})

vi.mock('../../src/lib/clerk', () => ({
  getClerkClient: () => ({
    users: { getUser: mockGetUser },
  }),
}))

import adminAuth from '../../src/plugins/admin-auth'

async function createAdminAuthTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })

  // Decorate request with clerk property (simulating clerk-auth plugin)
  app.decorateRequest('clerk', null)

  // We'll set clerk per-test via a preHandler that runs BEFORE admin-auth
  app.addHook('preHandler', async (request) => {
    // Default: authenticated user — tests can override via mockClerk
    if (!request.clerk) {
      request.clerk = { userId: 'clerk_admin_user', sessionId: 'sess_test' } as any
    }
  })

  await app.register(adminAuth)

  app.get('/api/admin/test', async (request) => {
    return { ok: true, clerkUserId: (request.clerk as any)?.userId }
  })

  await app.ready()
  return app
}

describe('admin-auth plugin', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createAdminAuthTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts request when user has admin role', async () => {
    mockGetUser.mockResolvedValueOnce({
      publicMetadata: { role: 'admin' },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/test',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().ok).toBe(true)
  })

  it('rejects request with 403 when user has non-admin role', async () => {
    mockGetUser.mockResolvedValueOnce({
      publicMetadata: { role: 'user' },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/test',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('FORBIDDEN')
  })

  it('rejects request with 401 when no auth context is present', async () => {
    // Create a separate app where clerk is not set
    const unauthApp = Fastify({ logger: false })
    unauthApp.decorateRequest('clerk', null)
    await unauthApp.register(adminAuth)
    unauthApp.get('/api/admin/test', async () => ({ ok: true }))
    await unauthApp.ready()

    const response = await unauthApp.inject({
      method: 'GET',
      url: '/api/admin/test',
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')

    await unauthApp.close()
  })

  it('attaches admin clerk ID to the request', async () => {
    mockGetUser.mockResolvedValueOnce({
      publicMetadata: { role: 'admin' },
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/test',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().clerkUserId).toBe('clerk_admin_user')
    expect(mockGetUser).toHaveBeenCalledWith('clerk_admin_user')
  })
})
