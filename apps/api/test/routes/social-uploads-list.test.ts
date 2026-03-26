import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  jobs: { id: 'id', userId: 'userId' },
  socialUploads: { jobId: 'jobId', createdAt: 'createdAt' },
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../helpers/test-app'
import socialUploadsListRoutes from '../../src/routes/social-uploads-list'
import { getDb } from '../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

describe('GET /api/jobs/:id/social-uploads', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(socialUploadsListRoutes)
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

  it('returns all upload records for a job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1' }])

    const uploadRecord = {
      id: 'su-1',
      platform: 'youtube',
      status: 'live',
      metadata: { title: 'Test', description: '', privacy: 'unlisted' },
      rcCost: 10,
      platformUrl: 'https://youtube.com/watch?v=xxx',
      errorMessage: null,
      createdAt: new Date('2026-03-18T12:00:00.000Z'),
      updatedAt: new Date('2026-03-18T12:05:00.000Z'),
    }
    // orderBy returns the final result
    mockDb.orderBy.mockResolvedValueOnce([uploadRecord])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/social-uploads',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.uploads).toHaveLength(1)
    expect(body.uploads[0].platform).toBe('youtube')
    expect(body.uploads[0].status).toBe('live')
    expect(body.uploads[0].rcCost).toBe(10)
  })

  it('returns empty array when no uploads exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'user-1' }])
    mockDb.orderBy.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/social-uploads',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().uploads).toEqual([])
  })

  it('returns 403 when user does not own the job', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'job-1', userId: 'other-user' }])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/job-1/social-uploads',
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe('JOB_NOT_OWNED')
  })

  it('returns 404 when job does not exist', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({
      method: 'GET',
      url: '/api/jobs/nonexistent/social-uploads',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('JOB_NOT_FOUND')
  })
})
