import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

const { mockLogAdminAction } = vi.hoisted(() => {
  const mockLogAdminAction = vi.fn()
  return { mockLogAdminAction }
})

vi.mock('@racedash/db', () => ({
  users: { id: 'id' },
  licenses: { id: 'id', userId: 'userId', status: 'status' },
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  eq: vi.fn(),
  and: vi.fn(),
}))

vi.mock('../../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../../helpers/test-app'
import licensesRoutes from '../../../src/routes/admin/licenses'
import { getDb } from '../../../src/lib/db'

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
    'transaction',
  ]
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

const now = new Date()
const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

const validIssuePayload = {
  tier: 'pro',
  startsAt: now.toISOString(),
  expiresAt: future.toISOString(),
}

const mockLicense = {
  id: 'lic-1',
  userId: 'u-1',
  tier: 'pro',
  status: 'active',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  startsAt: now,
  expiresAt: future,
  createdAt: now,
  updatedAt: now,
}

describe('POST /api/admin/users/:id/licenses', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(licensesRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockLogAdminAction.mockReset()
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('issues license with valid data', async () => {
    // User exists
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.returning.mockResolvedValueOnce([mockLicense])
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/licenses',
      payload: validIssuePayload,
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().license.tier).toBe('pro')
    expect(response.json().license.status).toBe('active')
  })

  it('rejects invalid tier', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/licenses',
      payload: { ...validIssuePayload, tier: 'platinum' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects invalid dates (expiresAt before startsAt)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/licenses',
      payload: {
        tier: 'pro',
        startsAt: future.toISOString(),
        expiresAt: now.toISOString(),
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects nonexistent user', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // no user

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/nonexistent/licenses',
      payload: validIssuePayload,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('creates an audit log entry', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.returning.mockResolvedValueOnce([mockLicense])
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/licenses',
      payload: validIssuePayload,
    })

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'license.issue' }),
    )
  })
})

describe('PATCH /api/admin/users/:id/licenses/:licenseId', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(licensesRoutes)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    mockDb = createMockDb()
    mockedGetDb.mockReturnValue(mockDb as any)
    mockLogAdminAction.mockReset()
    vi.clearAllMocks()
    mockedGetDb.mockReturnValue(mockDb as any)
  })

  it('extends license with new expiresAt', async () => {
    const newExpiry = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000)

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.limit.mockResolvedValueOnce([mockLicense]) // existing license
      tx.returning.mockResolvedValueOnce([{ ...mockLicense, expiresAt: newExpiry }])
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/u-1/licenses/lic-1',
      payload: { expiresAt: newExpiry.toISOString() },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().license.id).toBe('lic-1')
  })

  it('rejects invalid expiresAt date', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/u-1/licenses/lic-1',
      payload: { expiresAt: 'not-a-date' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('revokes license by setting status to cancelled', async () => {
    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.limit.mockResolvedValueOnce([mockLicense])
      tx.returning.mockResolvedValueOnce([{ ...mockLicense, status: 'cancelled' }])
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/u-1/licenses/lic-1',
      payload: { status: 'cancelled' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().license.status).toBe('cancelled')
  })

  it('creates audit log on revoke', async () => {
    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.limit.mockResolvedValueOnce([mockLicense])
      tx.returning.mockResolvedValueOnce([{ ...mockLicense, status: 'cancelled' }])
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/u-1/licenses/lic-1',
      payload: { status: 'cancelled' },
    })

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'license.revoke' }),
    )
  })

  it('rejects when both expiresAt and status are provided', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/u-1/licenses/lic-1',
      payload: {
        expiresAt: future.toISOString(),
        status: 'cancelled',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects when no fields are provided', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/u-1/licenses/lic-1',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })
})
