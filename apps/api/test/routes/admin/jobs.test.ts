import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', email: 'email' },
  jobs: { id: 'id', userId: 'userId', status: 'status', config: 'config', inputS3Keys: 'inputS3Keys', uploadIds: 'uploadIds', outputS3Key: 'outputS3Key', downloadExpiresAt: 'downloadExpiresAt', slotTaskToken: 'slotTaskToken', renderTaskToken: 'renderTaskToken', remotionRenderId: 'remotionRenderId', rcCost: 'rcCost', sfnExecutionArn: 'sfnExecutionArn', errorMessage: 'errorMessage', createdAt: 'createdAt', updatedAt: 'updatedAt' },
  creditReservations: { id: 'id', jobId: 'jobId', rcAmount: 'rcAmount', status: 'status', createdAt: 'createdAt', settledAt: 'settledAt' },
  creditReservationPacks: { reservationId: 'reservationId', packId: 'packId', rcDeducted: 'rcDeducted' },
  creditPacks: { id: 'id', packName: 'packName' },
  eq: vi.fn(), and: vi.fn(), gt: vi.fn(), lt: vi.fn(), gte: vi.fn(), desc: vi.fn(), or: vi.fn(), inArray: vi.fn(), sql: vi.fn(),
}))

vi.mock('../../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../../helpers/test-app'
import jobsRoutes from '../../../src/routes/admin/jobs'
import { getDb } from '../../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'update', 'set', 'returning', 'transaction', 'innerJoin', 'groupBy']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

const now = new Date()

function makeJobRow(overrides: Record<string, any> = {}) {
  return {
    id: 'job-1',
    userEmail: 'user@test.com',
    status: 'complete',
    rcCost: 10,
    createdAt: now,
    updatedAt: new Date(now.getTime() + 60000),
    errorMessage: null,
    ...overrides,
  }
}

describe('GET /api/admin/jobs', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobsRoutes)
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

  it('lists jobs with default pagination', async () => {
    const jobs = [makeJobRow({ id: 'job-1' }), makeJobRow({ id: 'job-2' })]
    mockDb.limit.mockResolvedValueOnce(jobs)

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.jobs).toHaveLength(2)
    expect(body.nextCursor).toBeNull()
  })

  it('filters by single status', async () => {
    mockDb.limit.mockResolvedValueOnce([makeJobRow({ status: 'failed' })])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs?status=failed',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().jobs).toHaveLength(1)
  })

  it('filters by comma-separated statuses', async () => {
    mockDb.limit.mockResolvedValueOnce([
      makeJobRow({ id: 'job-1', status: 'queued' }),
      makeJobRow({ id: 'job-2', status: 'rendering' }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs?status=queued,rendering',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().jobs).toHaveLength(2)
  })

  it('supports cursor pagination', async () => {
    // First call: cursor job lookup
    mockDb.limit.mockResolvedValueOnce([{ createdAt: now, id: 'job-5' }])
    // Second call: actual page
    mockDb.limit.mockResolvedValueOnce([makeJobRow({ id: 'job-6' })])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs?cursor=job-5',
    })

    expect(response.statusCode).toBe(200)
  })

  it('uses default limit of 50', async () => {
    mockDb.limit.mockResolvedValueOnce([])

    await app.inject({
      method: 'GET',
      url: '/api/admin/jobs',
    })

    expect(mockDb.limit).toHaveBeenCalledWith(51)
  })

  it('caps limit at 100', async () => {
    mockDb.limit.mockResolvedValueOnce([])

    await app.inject({
      method: 'GET',
      url: '/api/admin/jobs?limit=500',
    })

    expect(mockDb.limit).toHaveBeenCalledWith(101)
  })

  it('sorts by createdAt desc', async () => {
    const jobs = [
      makeJobRow({ id: 'job-2', createdAt: new Date(now.getTime() + 1000) }),
      makeJobRow({ id: 'job-1', createdAt: now }),
    ]
    mockDb.limit.mockResolvedValueOnce(jobs)

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    // First job should have later createdAt
    expect(new Date(body.jobs[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(body.jobs[1].createdAt).getTime(),
    )
  })

  it('returns empty result set', async () => {
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.jobs).toHaveLength(0)
    expect(body.nextCursor).toBeNull()
  })
})

describe('GET /api/admin/jobs/:id', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(jobsRoutes)
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

  it('returns full job detail', async () => {
    const jobRow = {
      id: 'job-1', userId: 'u-1', userEmail: 'user@test.com',
      status: 'complete', config: { fps: 30 }, inputS3Keys: ['key1'],
      uploadIds: ['up1'], outputS3Key: 'output.mp4',
      downloadExpiresAt: now, slotTaskToken: null,
      renderTaskToken: null, remotionRenderId: 'r-1',
      rcCost: 10, sfnExecutionArn: null, errorMessage: null,
      createdAt: now, updatedAt: now,
    }
    mockDb.limit.mockResolvedValueOnce([jobRow])
    // No credit reservation
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs/job-1',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.job.id).toBe('job-1')
    expect(body.job.userEmail).toBe('user@test.com')
  })

  it('returns 404 for missing job', async () => {
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs/nonexistent',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('includes sfnConsoleUrl when sfnExecutionArn is present', async () => {
    const arn = 'arn:aws:states:eu-west-2:123:execution:MyStateMachine:exec-1'
    const jobRow = {
      id: 'job-1', userId: 'u-1', userEmail: 'user@test.com',
      status: 'rendering', config: {}, inputS3Keys: [],
      uploadIds: [], outputS3Key: null,
      downloadExpiresAt: null, slotTaskToken: null,
      renderTaskToken: null, remotionRenderId: null,
      rcCost: null, sfnExecutionArn: arn, errorMessage: null,
      createdAt: now, updatedAt: now,
    }
    mockDb.limit.mockResolvedValueOnce([jobRow])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs/job-1',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.sfnConsoleUrl).toContain('console.aws.amazon.com/states')
    expect(body.sfnConsoleUrl).toContain(encodeURIComponent ? arn : arn)
  })

  it('includes creditReservation when one exists', async () => {
    const jobRow = {
      id: 'job-1', userId: 'u-1', userEmail: 'user@test.com',
      status: 'complete', config: {}, inputS3Keys: [],
      uploadIds: [], outputS3Key: 'output.mp4',
      downloadExpiresAt: null, slotTaskToken: null,
      renderTaskToken: null, remotionRenderId: null,
      rcCost: 10, sfnExecutionArn: null, errorMessage: null,
      createdAt: now, updatedAt: now,
    }
    mockDb.limit.mockResolvedValueOnce([jobRow])
    // Credit reservation exists
    mockDb.limit.mockResolvedValueOnce([{
      id: 'res-1', rcAmount: 10, status: 'settled',
      createdAt: now, settledAt: now,
    }])
    // Skip .where() for job query and credit reservation query — keep chain intact
    mockDb.where
      .mockReturnValueOnce(mockDb)   // job query .where()
      .mockReturnValueOnce(mockDb)   // credit reservation .where()
      .mockResolvedValueOnce([{      // pack breakdown .where() — terminates
        packId: 'cp-1', packName: 'Starter', rcDeducted: 10,
      }])

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs/job-1',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.creditReservation).not.toBeNull()
    expect(body.creditReservation.id).toBe('res-1')
    expect(body.creditReservation.packs).toHaveLength(1)
  })
})
