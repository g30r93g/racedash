import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

process.env.S3_UPLOAD_BUCKET = 'test-upload-bucket'
process.env.STEP_FUNCTIONS_STATE_MACHINE_ARN = 'arn:aws:states:eu-west-2:123456789:stateMachine:test'
process.env.CLOUDFRONT_DOMAIN = 'cdn.test.racedash.io'
process.env.CLOUDFRONT_KEY_PAIR_ID = 'KTEST123'
process.env.CLOUDFRONT_PRIVATE_KEY_PEM = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----'

// vi.hoisted ensures these are available in the vi.mock factory
const { mockReserveCredits, mockComputeCredits, mockCheckLicenseExpiry, InsufficientCreditsErrorClass } = vi.hoisted(
  () => {
    const mockReserveCredits = vi.fn()
    const mockComputeCredits = vi.fn().mockReturnValue(50)
    const mockCheckLicenseExpiry = vi.fn()
    const InsufficientCreditsErrorClass = class extends Error {
      available = 10
      required = 50
      constructor() {
        super('Insufficient credits')
        this.name = 'InsufficientCreditsError'
      }
    }
    return { mockReserveCredits, mockComputeCredits, mockCheckLicenseExpiry, InsufficientCreditsErrorClass }
  },
)

const { mockS3Send, mockSfnSend, mockGetSignedUrl, mockGetCloudFrontSignedUrl } = vi.hoisted(() => ({
  mockS3Send: vi.fn().mockResolvedValue({ UploadId: 'test-upload-id' }),
  mockSfnSend: vi.fn().mockResolvedValue({ executionArn: 'arn:aws:states:eu-west-2:123456789:execution:test:exec-1' }),
  mockGetSignedUrl: vi.fn().mockResolvedValue('https://s3.test.amazonaws.com/presigned'),
  mockGetCloudFrontSignedUrl: vi.fn().mockReturnValue('https://cdn.test.racedash.io/signed'),
}))

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  licenses: { id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt' },
  jobs: { id: 'id', userId: 'userId', status: 'status', createdAt: 'createdAt', outputS3Key: 'outputS3Key' },
  reserveCredits: (...args: unknown[]) => mockReserveCredits(...args),
  computeCredits: (...args: unknown[]) => mockComputeCredits(...args),
  checkLicenseExpiry: (...args: unknown[]) => mockCheckLicenseExpiry(...args),
  InsufficientCreditsError: InsufficientCreditsErrorClass,
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn() }))

vi.mock('../../src/lib/aws', () => ({
  s3: { send: (...args: unknown[]) => mockS3Send(...args) },
  sfn: { send: (...args: unknown[]) => mockSfnSend(...args) },
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  CreateMultipartUploadCommand: vi.fn().mockImplementation(function (input: unknown) {
    Object.assign(this, input)
    this._command = 'CreateMultipartUpload'
  }),
  UploadPartCommand: vi.fn().mockImplementation(function (input: unknown) {
    Object.assign(this, input)
    this._command = 'UploadPart'
  }),
  CompleteMultipartUploadCommand: vi.fn().mockImplementation(function (input: unknown) {
    Object.assign(this, input)
    this._command = 'CompleteMultipartUpload'
  }),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}))

vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: vi.fn(),
  StartExecutionCommand: vi.fn().mockImplementation(function (input: unknown) {
    Object.assign(this, input)
    this._command = 'StartExecution'
  }),
}))

vi.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetCloudFrontSignedUrl(...args),
}))

import { createTestApp, createUnauthenticatedTestApp } from '../helpers/test-app'
import jobRoutes from '../../src/routes/jobs'
import { getDb } from '../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = [
    'select',
    'from',
    'where',
    'limit',
    'orderBy',
    'insert',
    'values',
    'update',
    'set',
    'returning',
    'delete',
    'transaction',
  ]
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

const validCreateJobPayload = {
  config: {
    resolution: '1080p',
    frameRate: '60',
    renderMode: 'full',
    overlayStyle: 'standard',
    config: { dataSource: 'aim' },
  },
  sourceVideo: {
    width: 1920,
    height: 1080,
    fps: 60,
    durationSeconds: 120,
    fileSizeBytes: 500_000_000,
  },
  projectName: 'GG Club100 Rd.3',
  sessionType: 'race',
}

// ─── POST /api/jobs ──────────────────────────────────────────────────────────

describe('POST /api/jobs', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockComputeCredits.mockReturnValue(50)
    mockCheckLicenseExpiry.mockResolvedValue({ hasActiveLicense: true })
  })

  it('creates a job and returns 201 with jobId, rcCost, uploadKey', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }]) // resolveUser
    mockDb.returning.mockResolvedValueOnce([{ id: 'job-1' }]) // insert job
    mockReserveCredits.mockResolvedValueOnce({ reservationId: 'res-1' })

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: validCreateJobPayload,
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.jobId).toBe('job-1')
    expect(body.rcCost).toBe(50)
    expect(body.uploadKey).toContain('uploads/')
  })

  it('returns 402 when user has insufficient credits', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.returning.mockResolvedValueOnce([{ id: 'job-1' }])
    mockReserveCredits.mockRejectedValueOnce(new InsufficientCreditsErrorClass())

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: validCreateJobPayload,
    })

    expect(response.statusCode).toBe(402)
    expect(response.json().error.code).toBe('INSUFFICIENT_CREDITS')
  })

  it('returns 403 when user has no active license', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockCheckLicenseExpiry.mockResolvedValueOnce({ hasActiveLicense: false })

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: validCreateJobPayload,
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('LICENSE_REQUIRED')
  })

  it('returns 400 when body is missing required fields', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { projectName: 'test' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
  })

  it('returns 404 for unauthenticated user (no user record)', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // no user

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: validCreateJobPayload,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('stores full config as JSONB on the job row', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.returning.mockResolvedValueOnce([{ id: 'job-1' }])
    mockReserveCredits.mockResolvedValueOnce({ reservationId: 'res-1' })

    await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: validCreateJobPayload,
    })

    // Verify insert was called with config containing JSONB fields
    const insertValues = mockDb.values.mock.calls[0]?.[0]
    expect(insertValues).toBeDefined()
    expect(insertValues.config).toMatchObject({
      resolution: '1080p',
      frameRate: '60',
      renderMode: 'full',
      overlayStyle: 'standard',
      sourceVideo: validCreateJobPayload.sourceVideo,
      projectName: 'GG Club100 Rd.3',
      sessionType: 'race',
    })
  })

  it('sets initial status to uploading', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.returning.mockResolvedValueOnce([{ id: 'job-1' }])
    mockReserveCredits.mockResolvedValueOnce({ reservationId: 'res-1' })

    await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: validCreateJobPayload,
    })

    const insertValues = mockDb.values.mock.calls[0]?.[0]
    expect(insertValues.status).toBe('uploading')
  })

  it('computes rcCost from sourceVideo dimensions', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.returning.mockResolvedValueOnce([{ id: 'job-1' }])
    mockReserveCredits.mockResolvedValueOnce({ reservationId: 'res-1' })

    await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: validCreateJobPayload,
    })

    expect(mockComputeCredits).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      fps: 60,
      durationSec: 120,
    })
  })
})

// ─── POST /api/jobs/:id/start-upload ─────────────────────────────────────────

describe('POST /api/jobs/:id/start-upload', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockS3Send.mockResolvedValue({ UploadId: 'test-upload-id' })
    mockGetSignedUrl.mockResolvedValue('https://s3.test.amazonaws.com/presigned')
  })

  it('returns presigned URLs for multipart upload', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }]) // resolveUser
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'uploading' }]) // findOwnedJob

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/start-upload',
      payload: { partCount: 3, partSize: 5_242_880, contentType: 'video/mp4' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.uploadId).toBe('test-upload-id')
    expect(body.presignedUrls).toHaveLength(3)
  })

  it('returns 404 when job does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([]) // findOwnedJob returns null

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/nonexistent/start-upload',
      payload: { partCount: 1, partSize: 5_242_880, contentType: 'video/mp4' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 404 when user does not own the job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([]) // and() filter excludes other user's jobs

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/start-upload',
      payload: { partCount: 1, partSize: 5_242_880, contentType: 'video/mp4' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 409 when job status is not uploading', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'queued' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/start-upload',
      payload: { partCount: 1, partSize: 5_242_880, contentType: 'video/mp4' },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('INVALID_JOB_STATUS')
  })

  it('generates presigned URL count matching partCount', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1', status: 'uploading' }])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/start-upload',
      payload: { partCount: 5, partSize: 5_242_880, contentType: 'video/mp4' },
    })

    const body = response.json()
    expect(body.presignedUrls).toHaveLength(5)
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(5)
  })

  it('uses uploads/{jobId}/ S3 key prefix', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-42', userId: 'user-1', status: 'uploading' }])

    await app.inject({
      method: 'POST',
      url: '/api/jobs/job-42/start-upload',
      payload: { partCount: 1, partSize: 5_242_880, contentType: 'video/mp4' },
    })

    // The CreateMultipartUploadCommand should have been called with the correct key
    const { CreateMultipartUploadCommand } = await import('@aws-sdk/client-s3')
    expect(CreateMultipartUploadCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: 'uploads/job-42/joined.mp4' }),
    )
  })
})

// ─── POST /api/jobs/:id/complete-upload ──────────────────────────────────────

describe('POST /api/jobs/:id/complete-upload', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockS3Send.mockResolvedValue({})
    mockSfnSend.mockResolvedValue({ executionArn: 'arn:aws:states:eu-west-2:123456789:execution:test:exec-1' })
  })

  const completeParts = { parts: [{ partNumber: 1, etag: '"abc123"' }] }

  it('completes upload and starts SFN, returns queued status', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      { id: 'job-1', userId: 'user-1', status: 'uploading', uploadIds: { uploadId: 'upload-1' } },
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/complete-upload',
      payload: completeParts,
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.jobId).toBe('job-1')
    expect(body.status).toBe('queued')
    expect(body.executionArn).toBeDefined()
  })

  it('returns 404 when job does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/nonexistent/complete-upload',
      payload: completeParts,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 404 when user does not own the job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/complete-upload',
      payload: completeParts,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 409 when job status is not uploading', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      { id: 'job-1', userId: 'user-1', status: 'rendering', uploadIds: { uploadId: 'upload-1' } },
    ])

    const response = await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/complete-upload',
      payload: completeParts,
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('INVALID_JOB_STATUS')
  })

  it('stores sfn_execution_arn on the job row', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      { id: 'job-1', userId: 'user-1', status: 'uploading', uploadIds: { uploadId: 'upload-1' } },
    ])

    await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/complete-upload',
      payload: completeParts,
    })

    // Verify that update().set() was called with sfnExecutionArn
    const setCalls = mockDb.set.mock.calls
    const setCall = setCalls.find((c: any[]) => c[0]?.sfnExecutionArn !== undefined)
    expect(setCall).toBeDefined()
    expect(setCall![0].sfnExecutionArn).toBe('arn:aws:states:eu-west-2:123456789:execution:test:exec-1')
  })

  it('passes jobId and userId in SFN input', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      { id: 'job-1', userId: 'user-1', status: 'uploading', uploadIds: { uploadId: 'upload-1' } },
    ])

    await app.inject({
      method: 'POST',
      url: '/api/jobs/job-1/complete-upload',
      payload: completeParts,
    })

    const { StartExecutionCommand } = await import('@aws-sdk/client-sfn')
    const sfnInput = (StartExecutionCommand as any).mock.calls[0]?.[0]
    expect(sfnInput).toBeDefined()
    const parsed = JSON.parse(sfnInput.input)
    expect(parsed).toEqual({ jobId: 'job-1', userId: 'user-1' })
  })
})

// ─── GET /api/jobs/:id/status (SSE) ─────────────────────────────────────────

describe('GET /api/jobs/:id/status', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('returns text/event-stream content type', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // findOwnedJob
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
        errorMessage: null,
      },
    ])
    // poll query
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
        errorMessage: null,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/status',
    })

    expect(response.headers['content-type']).toContain('text/event-stream')
  })

  it('sends initial status event as first SSE message', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
        errorMessage: null,
      },
    ])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
        errorMessage: null,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/status',
    })

    const lines = response.body.split('\n').filter((l: string) => l.startsWith('data: '))
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const event = JSON.parse(lines[0].replace('data: ', ''))
    expect(event.status).toBe('complete')
  })

  it('returns 404 when job does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/nonexistent/status',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 404 when user does not own the job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/status',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('closes stream on complete status', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
        errorMessage: null,
      },
    ])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
        errorMessage: null,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/status',
    })

    // Response should complete (not hang) for terminal status
    expect(response.statusCode).toBe(200)
  })

  it('closes stream on failed status', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'failed',
        downloadExpiresAt: null,
        errorMessage: 'Render timeout',
      },
    ])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'failed',
        downloadExpiresAt: null,
        errorMessage: 'Render timeout',
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/status',
    })

    expect(response.statusCode).toBe(200)
    const lines = response.body.split('\n').filter((l: string) => l.startsWith('data: '))
    const event = JSON.parse(lines[0].replace('data: ', ''))
    expect(event.status).toBe('failed')
  })

  it('includes queuePosition for queued jobs', async () => {
    mockDb.limit
      .mockResolvedValueOnce([{ id: 'user-1' }]) // resolveUser
      .mockResolvedValueOnce([
        {
          // findOwnedJob
          id: 'job-2',
          userId: 'user-1',
          status: 'queued',
          downloadExpiresAt: null,
          errorMessage: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          // initial poll
          id: 'job-2',
          userId: 'user-1',
          status: 'queued',
          downloadExpiresAt: null,
          errorMessage: null,
          createdAt: new Date('2025-01-02'),
        },
      ])
      .mockResolvedValueOnce([
        {
          // interval poll → terminal
          id: 'job-2',
          userId: 'user-1',
          status: 'complete',
          downloadExpiresAt: null,
          errorMessage: null,
        },
      ])

    // Skip .where() for resolveUser, findOwnedJob, and poll — keep chain intact
    mockDb.where
      .mockReturnValueOnce(mockDb) // resolveUser .where()
      .mockReturnValueOnce(mockDb) // findOwnedJob .where()
      .mockReturnValueOnce(mockDb) // poll .where()
      .mockResolvedValueOnce([
        // queued jobs .where() — terminates
        { id: 'job-1', createdAt: new Date('2025-01-01') },
        { id: 'job-2', createdAt: new Date('2025-01-02') },
      ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-2/status',
    })

    const lines = response.body.split('\n').filter((l: string) => l.startsWith('data: '))
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const event = JSON.parse(lines[0].replace('data: ', ''))
    expect(event.queuePosition).toBe(2)
  }, 10_000)

  it('includes errorMessage for failed jobs', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'failed',
        downloadExpiresAt: null,
        errorMessage: 'Out of memory',
      },
    ])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'failed',
        downloadExpiresAt: null,
        errorMessage: 'Out of memory',
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/status',
    })

    const lines = response.body.split('\n').filter((l: string) => l.startsWith('data: '))
    const event = JSON.parse(lines[0].replace('data: ', ''))
    expect(event.errorMessage).toBe('Out of memory')
  })

  it('includes downloadExpiresAt for complete jobs', async () => {
    const expires = new Date('2030-06-15T12:00:00Z')
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: expires,
        errorMessage: null,
      },
    ])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: expires,
        errorMessage: null,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/status',
    })

    const lines = response.body.split('\n').filter((l: string) => l.startsWith('data: '))
    const event = JSON.parse(lines[0].replace('data: ', ''))
    expect(event.downloadExpiresAt).toBe(expires.toISOString())
  })
})

// ─── GET /api/jobs/:id/download ──────────────────────────────────────────────

describe('GET /api/jobs/:id/download', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockGetCloudFrontSignedUrl.mockReturnValue('https://cdn.test.racedash.io/signed')
  })

  it('returns signed download URL for complete job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/download',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.downloadUrl).toContain('https://')
    expect(body.expiresAt).toBeDefined()
  })

  it('returns 404 when job does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/nonexistent/download',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 404 when user does not own the job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/download',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('returns 409 when job is not complete', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'rendering',
        downloadExpiresAt: null,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/download',
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('INVALID_JOB_STATUS')
  })

  it('returns 410 when download has expired', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2020-01-01'), // expired
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/download',
    })

    expect(response.statusCode).toBe(410)
    expect(response.json().error.code).toBe('DOWNLOAD_EXPIRED')
  })

  it('generates CloudFront signed URL', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([
      {
        id: 'job-1',
        userId: 'user-1',
        status: 'complete',
        downloadExpiresAt: new Date('2030-01-01'),
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/download',
    })

    expect(mockGetCloudFrontSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('cdn.test.racedash.io'),
        keyPairId: 'KTEST123',
      }),
    )
    expect(response.json().downloadUrl).toBe('https://cdn.test.racedash.io/signed')
  })
})

// ─── GET /api/jobs ───────────────────────────────────────────────────────────

describe('GET /api/jobs', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  const makeJob = (id: string, status = 'complete') => ({
    id,
    userId: 'user-1',
    status,
    config: {
      resolution: '1080p',
      frameRate: '60',
      renderMode: 'full',
      overlayStyle: 'standard',
      config: {},
      sourceVideo: { width: 1920, height: 1080, fps: 60, durationSeconds: 60, fileSizeBytes: 100 },
      projectName: 'Test',
      sessionType: 'race',
    },
    rcCost: 50,
    downloadExpiresAt: null,
    errorMessage: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  })

  it('returns jobs scoped to the authenticated user', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }]) // resolveUser
    mockDb.limit.mockResolvedValueOnce([makeJob('job-1'), makeJob('job-2')]) // jobs query

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.jobs).toHaveLength(2)
  })

  it('does not leak jobs from other users (query is user-scoped)', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([]) // no jobs for this user

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().jobs).toHaveLength(0)
  })

  it('supports cursor-based pagination', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    // Cursor job lookup
    mockDb.limit.mockResolvedValueOnce([{ createdAt: new Date('2025-01-01'), id: 'job-5' }])
    // Jobs after cursor
    mockDb.limit.mockResolvedValueOnce([makeJob('job-4'), makeJob('job-3')])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs?cursor=job-5',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.jobs).toHaveLength(2)
  })

  it('defaults limit to 20', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    await app.inject({
      method: 'GET',
      url: '/api/jobs',
    })

    // limit is called with limitParam + 1 = 21
    const limitCalls = mockDb.limit.mock.calls
    const lastLimitCall = limitCalls[limitCalls.length - 1]
    expect(lastLimitCall[0]).toBe(21)
  })

  it('caps limit at 100', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    await app.inject({
      method: 'GET',
      url: '/api/jobs?limit=999',
    })

    const limitCalls = mockDb.limit.mock.calls
    const lastLimitCall = limitCalls[limitCalls.length - 1]
    expect(lastLimitCall[0]).toBe(101) // 100 + 1
  })

  it('includes queuePosition for queued jobs', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([makeJob('job-1', 'queued')])
    // Skip .where() for resolveUser and main query — keep chain intact
    mockDb.where
      .mockReturnValueOnce(mockDb) // resolveUser .where()
      .mockReturnValueOnce(mockDb) // main query .where()
      .mockResolvedValueOnce([
        // queued jobs .where() — terminates
        { id: 'job-1', createdAt: new Date('2025-01-01') },
      ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs',
    })

    const body = response.json()
    expect(body.jobs[0].queuePosition).toBe(1)
  })

  it('returns empty result with null nextCursor when no jobs exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs',
    })

    const body = response.json()
    expect(body.jobs).toEqual([])
    expect(body.nextCursor).toBeNull()
  })
})
