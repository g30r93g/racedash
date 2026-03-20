import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

process.env.SQS_SOCIAL_UPLOAD_QUEUE_URL = 'https://sqs.test.amazonaws.com/123456789/test-queue'

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(() => ({ send: vi.fn().mockResolvedValue({}) })),
  SendMessageCommand: vi.fn(),
}))

// vi.hoisted ensures these are available in the vi.mock factory
const { mockReserveCredits, InsufficientCreditsErrorClass } = vi.hoisted(() => {
  const mockReserveCredits = vi.fn()
  const InsufficientCreditsErrorClass = class extends Error { constructor() { super('Insufficient credits'); this.name = 'InsufficientCreditsError' } }
  return { mockReserveCredits, InsufficientCreditsErrorClass }
})

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  licenses: { id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt' },
  jobs: { id: 'id', userId: 'userId', status: 'status', outputS3Key: 'outputS3Key' },
  connectedAccounts: { id: 'id', userId: 'userId', platform: 'platform' },
  socialUploads: {
    id: 'id', jobId: 'jobId', userId: 'userId', platform: 'platform',
    status: 'status', metadata: 'metadata', rcCost: 'rcCost',
    creditReservationId: 'creditReservationId',
    createdAt: 'createdAt', updatedAt: 'updatedAt',
  },
  reserveCredits: (...args: unknown[]) => mockReserveCredits(...args),
  InsufficientCreditsError: InsufficientCreditsErrorClass,
  eq: vi.fn(), and: vi.fn(), gt: vi.fn(), desc: vi.fn(), inArray: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../helpers/test-app'
import socialUploadRoutes from '../../src/routes/social-upload'
import { getDb } from '../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'update', 'set', 'returning', 'transaction']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

const validPayload = {
  platform: 'youtube' as const,
  metadata: {
    title: '2026 Club100 Rd.3 - Race',
    description: 'Full race onboard',
    privacy: 'unlisted' as const,
  },
}

describe('POST /api/jobs/:id/social-upload', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(socialUploadRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockReserveCredits.mockReset()
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('creates social_uploads row and returns 201 with queued status', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])  // user
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])   // license
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete', outputS3Key: 'renders/job-1/output.mp4' }])  // job
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])    // connected account
    mockDb.limit.mockResolvedValueOnce([])                    // no existing upload

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<string>) => {
      const tx = createMockDb()
      tx.returning.mockResolvedValueOnce([{ id: 'su-123' }])
      mockReserveCredits.mockResolvedValueOnce({ reservationId: 'res-1', packBreakdown: [] })
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.status).toBe('queued')
    expect(body.platform).toBe('youtube')
    expect(body.rcCost).toBe(10)
    expect(body.socialUploadId).toBeDefined()
  })

  it('returns 404 when job does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([])  // no job

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/nonexistent/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 403 when user does not own the job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'other-user', status: 'complete' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('JOB_NOT_OWNED')
  })

  it('returns 422 when job status is not complete', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'rendering' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('JOB_NOT_COMPLETE')
  })

  it('returns 404 when YouTube is not connected', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete' }])
    mockDb.limit.mockResolvedValueOnce([])  // no connected account

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('YOUTUBE_NOT_CONNECTED')
  })

  it('returns 403 when user has no active license', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])  // no license

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('LICENSE_REQUIRED')
  })

  it('returns 409 when active upload already exists for job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'existing-upload' }])  // existing active upload

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('UPLOAD_ALREADY_EXISTS')
  })

  it('returns 400 when title exceeds 100 chars', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: {
        platform: 'youtube',
        metadata: { title: 'x'.repeat(101), description: '', privacy: 'unlisted' },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when title is empty', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: {
        platform: 'youtube',
        metadata: { title: '', description: '', privacy: 'unlisted' },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
  })

  it('returns 400 when privacy is invalid value', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: {
        platform: 'youtube',
        metadata: { title: 'Test', description: '', privacy: 'invalid' },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
  })

  it('returns 402 when user has insufficient credits', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete', outputS3Key: 'renders/job-1/output.mp4' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<string>) => {
      const tx = createMockDb()
      tx.returning.mockResolvedValueOnce([{ id: 'su-123' }])
      mockReserveCredits.mockRejectedValueOnce(new InsufficientCreditsErrorClass())
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(402)
    expect(response.json().error.code).toBe('INSUFFICIENT_CREDITS')
  })

  it('allows re-upload after previous upload failed', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete', outputS3Key: 'renders/job-1/output.mp4' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])
    mockDb.limit.mockResolvedValueOnce([])  // no active upload (previous was failed)

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<string>) => {
      const tx = createMockDb()
      tx.returning.mockResolvedValueOnce([{ id: 'su-456' }])
      mockReserveCredits.mockResolvedValueOnce({ reservationId: 'res-2', packBreakdown: [] })
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: validPayload,
    })

    expect(response.statusCode).toBe(201)
  })
})
