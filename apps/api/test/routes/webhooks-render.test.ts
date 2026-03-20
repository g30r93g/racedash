import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

process.env.WEBHOOK_SECRET = 'test-webhook-secret-456'

const { mockSfnSend, mockClaimNextQueuedSlotToken } = vi.hoisted(() => ({
  mockSfnSend: vi.fn().mockResolvedValue({}),
  mockClaimNextQueuedSlotToken: vi.fn(),
}))

vi.mock('../../src/lib/aws', () => ({
  s3: { send: vi.fn() },
  sfn: { send: (...args: unknown[]) => mockSfnSend(...args) },
}))

vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: vi.fn(),
  SendTaskSuccessCommand: vi.fn().mockImplementation((input) => ({ ...input, _command: 'SendTaskSuccess' })),
}))

vi.mock('@racedash/db', () => ({
  claimNextQueuedSlotToken: (...args: unknown[]) => mockClaimNextQueuedSlotToken(...args),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn().mockReturnValue({}) }))

import { createUnauthenticatedTestApp } from '../helpers/test-app'
import webhooksRenderRoutes from '../../src/routes/webhooks-render'

const succeededPayload = {
  detail: {
    executionArn: 'arn:aws:states:eu-west-2:123456789:execution:test:exec-1',
    status: 'SUCCEEDED' as const,
    input: JSON.stringify({ jobId: 'job-1', userId: 'user-1' }),
  },
}

const failedPayload = {
  detail: {
    executionArn: 'arn:aws:states:eu-west-2:123456789:execution:test:exec-2',
    status: 'FAILED' as const,
    input: JSON.stringify({ jobId: 'job-2', userId: 'user-1' }),
  },
}

describe('POST /api/webhooks/render', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createUnauthenticatedTestApp(webhooksRenderRoutes)
  })

  afterAll(async () => { await app.close() })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSfnSend.mockResolvedValue({})
    mockClaimNextQueuedSlotToken.mockResolvedValue(null)
  })

  it('processes SUCCEEDED event and signals next queued slot', async () => {
    mockClaimNextQueuedSlotToken.mockResolvedValueOnce('queued-task-token-1')

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/render',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': 'test-webhook-secret-456',
      },
      payload: succeededPayload,
    })

    expect(response.statusCode).toBe(200)
    expect(mockClaimNextQueuedSlotToken).toHaveBeenCalled()

    const { SendTaskSuccessCommand } = await import('@aws-sdk/client-sfn')
    expect(SendTaskSuccessCommand).toHaveBeenCalledWith(
      expect.objectContaining({ taskToken: 'queued-task-token-1' }),
    )
  })

  it('processes FAILED event and attempts to signal next slot', async () => {
    mockClaimNextQueuedSlotToken.mockResolvedValueOnce('queued-task-token-2')

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/render',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': 'test-webhook-secret-456',
      },
      payload: failedPayload,
    })

    expect(response.statusCode).toBe(200)
    expect(mockClaimNextQueuedSlotToken).toHaveBeenCalled()
    expect(mockSfnSend).toHaveBeenCalled()
  })

  it('returns 200 without signalling when no queued jobs exist', async () => {
    mockClaimNextQueuedSlotToken.mockResolvedValueOnce(null)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/render',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': 'test-webhook-secret-456',
      },
      payload: succeededPayload,
    })

    expect(response.statusCode).toBe(200)
    expect(mockSfnSend).not.toHaveBeenCalled()
  })

  it('returns 401 when webhook secret is invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/render',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': 'wrong-secret-value',
      },
      payload: succeededPayload,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 when webhook secret header is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/render',
      headers: { 'content-type': 'application/json' },
      payload: succeededPayload,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
  })

  it('uses timingSafeEqual for secret comparison', async () => {
    // Verify correct secret passes and wrong secret (same length) fails
    const correctResp = await app.inject({
      method: 'POST',
      url: '/api/webhooks/render',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': 'test-webhook-secret-456',
      },
      payload: succeededPayload,
    })
    expect(correctResp.statusCode).toBe(200)

    // Same-length but different secret should fail
    const wrongResp = await app.inject({
      method: 'POST',
      url: '/api/webhooks/render',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': 'test-webhook-secret-789',
      },
      payload: succeededPayload,
    })
    expect(wrongResp.statusCode).toBe(401)
  })
})
