import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

process.env.SQS_SOCIAL_UPLOAD_QUEUE_URL = 'https://sqs.test.amazonaws.com/123456789/test-queue'

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn().mockImplementation(function () { this.send = vi.fn().mockResolvedValue({}) }),
  SendMessageCommand: vi.fn().mockImplementation(function (input: unknown) { Object.assign(this, input) }),
}))

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

describe('Snapshot: Social Upload', () => {
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

  it('POST /social-upload error (insufficient credits) shape', async () => {
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
      payload: { platform: 'youtube', metadata: { title: 'Test', description: '', privacy: 'unlisted' } },
    })

    expect(response.json()).toMatchInlineSnapshot(`
      {
        "error": {
          "code": "INSUFFICIENT_CREDITS",
          "message": "Insufficient credits. You need at least 10 RC to upload to YouTube.",
        },
      }
    `)
  })

  it('POST /social-upload error (duplicate upload) shape', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'lic-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'complete' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'existing' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/social-upload',
      payload: { platform: 'youtube', metadata: { title: 'Test', description: '', privacy: 'unlisted' } },
    })

    expect(response.json()).toMatchInlineSnapshot(`
      {
        "error": {
          "code": "UPLOAD_ALREADY_EXISTS",
          "message": "An active or completed YouTube upload already exists for this job",
        },
      }
    `)
  })
})
