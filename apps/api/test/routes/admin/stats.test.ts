import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', email: 'email' },
  jobs: { id: 'id', userId: 'userId', status: 'status', errorMessage: 'errorMessage', updatedAt: 'updatedAt', createdAt: 'createdAt' },
  eq: vi.fn(), and: vi.fn(), gte: vi.fn(), lte: vi.fn(), sql: vi.fn(),
}))

vi.mock('../../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../../helpers/test-app'
import statsRoutes from '../../../src/routes/admin/stats'
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

describe('GET /api/admin/stats/overview', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(statsRoutes)
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

  function setupMockResponses(overrides: {
    inFlight?: Array<{ status: string; count: number }>,
    completedCount?: number,
    failedCount?: number,
    terminalTotal?: number,
    terminalFailed?: number,
    recentFailed?: Array<any>,
  } = {}) {
    // In-flight counts (groupBy result)
    mockDb.groupBy.mockResolvedValueOnce(overrides.inFlight ?? [])
    // Completed today
    mockDb.where.mockResolvedValueOnce([{ count: overrides.completedCount ?? 0 }])
    // Failed today
    mockDb.where.mockResolvedValueOnce([{ count: overrides.failedCount ?? 0 }])
    // Terminal jobs (7-day)
    mockDb.where.mockResolvedValueOnce([{
      total: overrides.terminalTotal ?? 0,
      failed: overrides.terminalFailed ?? 0,
    }])
    // Recent failed
    mockDb.limit.mockResolvedValueOnce(overrides.recentFailed ?? [])
  }

  it('returns in-flight counts by status', async () => {
    setupMockResponses({
      inFlight: [
        { status: 'queued', count: 3 },
        { status: 'rendering', count: 2 },
      ],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.inFlight.queued).toBe(3)
    expect(body.inFlight.rendering).toBe(2)
    expect(body.inFlight.uploading).toBe(0)
    expect(body.inFlight.compositing).toBe(0)
  })

  it('returns completed today count', async () => {
    setupMockResponses({ completedCount: 15 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().completedToday).toBe(15)
  })

  it('returns failed today count', async () => {
    setupMockResponses({ failedCount: 3 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().failedToday).toBe(3)
  })

  it('calculates 7-day failure rate', async () => {
    setupMockResponses({ terminalTotal: 100, terminalFailed: 5 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().failureRate7d).toBe(5)
  })

  it('returns recent failed jobs list', async () => {
    setupMockResponses({
      recentFailed: [
        { id: 'job-1', userEmail: 'a@test.com', errorMessage: 'OOM', failedAt: now },
        { id: 'job-2', userEmail: 'b@test.com', errorMessage: 'Timeout', failedAt: now },
      ],
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.recentFailedJobs).toHaveLength(2)
    expect(body.recentFailedJobs[0].errorMessage).toBe('OOM')
  })

  it('returns zeros for empty state', async () => {
    setupMockResponses()

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body.inFlight).toEqual({ uploading: 0, queued: 0, rendering: 0, compositing: 0 })
    expect(body.completedToday).toBe(0)
    expect(body.failedToday).toBe(0)
    expect(body.failureRate7d).toBe(0)
    expect(body.recentFailedJobs).toHaveLength(0)
  })

  it('handles no terminal jobs gracefully (zero failure rate)', async () => {
    setupMockResponses({ terminalTotal: 0, terminalFailed: 0 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().failureRate7d).toBe(0)
  })
})
