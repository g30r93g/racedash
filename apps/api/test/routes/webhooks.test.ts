import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

process.env.CLERK_WEBHOOK_SECRET = 'whsec_test_secret'

const { mockWebhookVerify } = vi.hoisted(() => {
  const mockWebhookVerify = vi.fn()
  return { mockWebhookVerify }
})

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(function () { this.verify = mockWebhookVerify }),
}))

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId', email: 'email' },
  eq: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createUnauthenticatedTestApp } from '../helpers/test-app'
import webhookRoutes from '../../src/routes/webhooks'
import { getDb } from '../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'insert', 'values']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

const validSvixHeaders = {
  'svix-id': 'msg_abc123',
  'svix-timestamp': '1234567890',
  'svix-signature': 'v1,valid_signature',
}

const userCreatedPayload = {
  type: 'user.created',
  data: {
    id: 'clerk_user_new',
    email_addresses: [{ email_address: 'gg@racedash.app' }],
    primary_email_address_id: 'email_1',
  },
}

describe('POST /api/webhooks/clerk', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createUnauthenticatedTestApp(webhookRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockWebhookVerify.mockReset()
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('creates DB user on valid user.created event with valid signature', async () => {
    mockWebhookVerify.mockReturnValueOnce(userCreatedPayload)
    mockDb.limit.mockResolvedValueOnce([]) // no existing user

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: validSvixHeaders,
      payload: userCreatedPayload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().received).toBe(true)
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('returns 200 and does nothing for unknown event types', async () => {
    const unknownEvent = { type: 'user.deleted', data: { id: 'clerk_user_1' } }
    mockWebhookVerify.mockReturnValueOnce(unknownEvent)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: validSvixHeaders,
      payload: unknownEvent,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().received).toBe(true)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it('returns 400 for missing svix headers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      payload: userCreatedPayload,
      // no svix headers
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
    expect(response.json().error.message).toBe('Missing svix headers')
  })

  it('returns 400 for invalid svix signature', async () => {
    mockWebhookVerify.mockImplementationOnce(() => {
      throw new Error('Invalid signature')
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: validSvixHeaders,
      payload: userCreatedPayload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
    expect(response.json().error.message).toBe('Webhook signature verification failed')
  })

  it('returns 400 for replayed request (stale timestamp)', async () => {
    mockWebhookVerify.mockImplementationOnce(() => {
      throw new Error('Message timestamp too old')
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: {
        'svix-id': 'msg_abc123',
        'svix-timestamp': '1000000000', // very old timestamp
        'svix-signature': 'v1,stale_signature',
      },
      payload: userCreatedPayload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_WEBHOOK_SIGNATURE')
  })

  it('is idempotent: duplicate user.created with same clerk_id does not error', async () => {
    mockWebhookVerify.mockReturnValueOnce(userCreatedPayload)
    mockDb.limit.mockResolvedValueOnce([{ id: 'existing-user-1' }]) // user already exists

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      headers: validSvixHeaders,
      payload: userCreatedPayload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().received).toBe(true)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})
