import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'

process.env.REMOTION_WEBHOOK_SECRET = 'test-remotion-secret-123'

const { mockSfnSend } = vi.hoisted(() => ({
  mockSfnSend: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../src/lib/aws', () => ({
  s3: { send: vi.fn() },
  sfn: { send: (...args: unknown[]) => mockSfnSend(...args) },
}))

vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: vi.fn(),
  SendTaskSuccessCommand: vi.fn().mockImplementation((input) => ({ ...input, _command: 'SendTaskSuccess' })),
  SendTaskFailureCommand: vi.fn().mockImplementation((input) => ({ ...input, _command: 'SendTaskFailure' })),
}))

import { createUnauthenticatedTestApp } from '../helpers/test-app'
import webhooksRemotionRoutes from '../../src/routes/webhooks-remotion'

function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(body).digest('hex')
}

const successPayload = {
  type: 'success' as const,
  renderId: 'render-abc',
  expectedBucketOwner: '123456789',
  customData: { taskToken: 'task-token-1', jobId: 'job-1' },
  outputUrl: 's3://bucket/output.mp4',
  outputFile: 'output.mp4',
}

const errorPayload = {
  type: 'error' as const,
  renderId: 'render-abc',
  expectedBucketOwner: '123456789',
  customData: { taskToken: 'task-token-2', jobId: 'job-2' },
  errors: [{ message: 'Render failed: out of memory' }],
}

const timeoutPayload = {
  type: 'timeout' as const,
  renderId: 'render-abc',
  expectedBucketOwner: '123456789',
  customData: { taskToken: 'task-token-3', jobId: 'job-3' },
}

describe('POST /api/webhooks/remotion', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createUnauthenticatedTestApp(webhooksRemotionRoutes)
  })

  afterAll(async () => { await app.close() })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSfnSend.mockResolvedValue({})
  })

  it('processes success webhook and sends SendTaskSuccessCommand', async () => {
    const body = JSON.stringify(successPayload)
    const signature = signPayload(body, 'test-remotion-secret-123')

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: {
        'content-type': 'application/json',
        'x-remotion-signature': signature,
      },
      payload: body,
    })

    expect(response.statusCode).toBe(200)

    const { SendTaskSuccessCommand } = await import('@aws-sdk/client-sfn')
    expect(SendTaskSuccessCommand).toHaveBeenCalledWith(
      expect.objectContaining({ taskToken: 'task-token-1' }),
    )
  })

  it('processes error webhook and sends SendTaskFailureCommand', async () => {
    const body = JSON.stringify(errorPayload)
    const signature = signPayload(body, 'test-remotion-secret-123')

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: {
        'content-type': 'application/json',
        'x-remotion-signature': signature,
      },
      payload: body,
    })

    expect(response.statusCode).toBe(200)

    const { SendTaskFailureCommand } = await import('@aws-sdk/client-sfn')
    expect(SendTaskFailureCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        taskToken: 'task-token-2',
        error: 'error',
        cause: expect.stringContaining('out of memory'),
      }),
    )
  })

  it('processes timeout webhook and sends SendTaskFailureCommand', async () => {
    const body = JSON.stringify(timeoutPayload)
    const signature = signPayload(body, 'test-remotion-secret-123')

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: {
        'content-type': 'application/json',
        'x-remotion-signature': signature,
      },
      payload: body,
    })

    expect(response.statusCode).toBe(200)

    const { SendTaskFailureCommand } = await import('@aws-sdk/client-sfn')
    expect(SendTaskFailureCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        taskToken: 'task-token-3',
        error: 'timeout',
      }),
    )
  })

  it('returns 401 with invalid HMAC signature', async () => {
    const body = JSON.stringify(successPayload)

    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: {
        'content-type': 'application/json',
        'x-remotion-signature': 'deadbeef'.repeat(16), // 128 hex chars = 64 bytes for sha512
      },
      payload: body,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 when signature header is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(successPayload),
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
  })

  it('passes taskToken from customData to SFN command', async () => {
    const body = JSON.stringify(successPayload)
    const signature = signPayload(body, 'test-remotion-secret-123')

    await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: {
        'content-type': 'application/json',
        'x-remotion-signature': signature,
      },
      payload: body,
    })

    const { SendTaskSuccessCommand } = await import('@aws-sdk/client-sfn')
    expect(SendTaskSuccessCommand).toHaveBeenCalledWith(
      expect.objectContaining({ taskToken: 'task-token-1' }),
    )
  })

  it('uses REMOTION_WEBHOOK_SECRET and rawBody for HMAC verification', async () => {
    // Verify that a correctly signed payload passes and an incorrectly signed one fails
    const body = JSON.stringify(successPayload)
    const correctSig = signPayload(body, 'test-remotion-secret-123')
    const wrongSig = signPayload(body, 'wrong-secret')

    const goodResp = await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: { 'content-type': 'application/json', 'x-remotion-signature': correctSig },
      payload: body,
    })
    expect(goodResp.statusCode).toBe(200)

    const badResp = await app.inject({
      method: 'POST',
      url: '/api/webhooks/remotion',
      headers: { 'content-type': 'application/json', 'x-remotion-signature': wrongSig },
      payload: body,
    })
    expect(badResp.statusCode).toBe(401)
  })
})
