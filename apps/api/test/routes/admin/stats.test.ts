import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', email: 'email' },
  jobs: { id: 'id', userId: 'userId', status: 'status', errorMessage: 'errorMessage', updatedAt: 'updatedAt', createdAt: 'createdAt' },
  eq: vi.fn(), and: vi.fn(), gte: vi.fn(), lte: vi.fn(), sql: vi.fn((...args: unknown[]) => args),
}))

vi.mock('../../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../../helpers/test-app'
import statsRoutes from '../../../src/routes/admin/stats'
import { getDb } from '../../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createChain(result: unknown) {
  const chain: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'innerJoin', 'groupBy']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  // Make the chain thenable so `await chain.where(...)` resolves
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

const now = new Date()

describe('GET /api/admin/stats/overview', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp(statsRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  function setupMockDb(overrides: {
    inFlight?: Array<{ status: string; count: number }>
    completedCount?: number
    failedCount?: number
    terminalTotal?: number
    terminalFailed?: number
    recentFailed?: Array<any>
  } = {}) {
    let callCount = 0
    const mockDb: any = {
      select: vi.fn(() => {
        callCount++
        switch (callCount) {
          case 1: return createChain(overrides.inFlight ?? [])
          case 2: return createChain([{ count: overrides.completedCount ?? 0 }])
          case 3: return createChain([{ count: overrides.failedCount ?? 0 }])
          case 4: return createChain([{ total: overrides.terminalTotal ?? 0, failed: overrides.terminalFailed ?? 0 }])
          case 5: return createChain(overrides.recentFailed ?? [])
          default: return createChain([])
        }
      }),
    }
    mockedGetDb.mockReturnValue(mockDb)
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns in-flight counts by status', async () => {
    setupMockDb({
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
    setupMockDb({ completedCount: 15 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().completedToday).toBe(15)
  })

  it('returns failed today count', async () => {
    setupMockDb({ failedCount: 3 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().failedToday).toBe(3)
  })

  it('calculates 7-day failure rate', async () => {
    setupMockDb({ terminalTotal: 100, terminalFailed: 5 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().failureRate7d).toBe(5)
  })

  it('returns recent failed jobs list', async () => {
    setupMockDb({
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
    setupMockDb()

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
    setupMockDb({ terminalTotal: 0, terminalFailed: 0 })

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/stats/overview',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().failureRate7d).toBe(0)
  })
})
