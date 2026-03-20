import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

const { mockLogAdminAction } = vi.hoisted(() => {
  const mockLogAdminAction = vi.fn()
  return { mockLogAdminAction }
})

vi.mock('@racedash/db', () => ({
  users: { id: 'id' },
  creditPacks: { id: 'id', userId: 'userId', packName: 'packName', rcTotal: 'rcTotal', rcRemaining: 'rcRemaining', priceGbp: 'priceGbp', purchasedAt: 'purchasedAt', expiresAt: 'expiresAt' },
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
  eq: vi.fn(), and: vi.fn(), gt: vi.fn(), asc: vi.fn(), sql: vi.fn(),
}))

vi.mock('../../../src/lib/db', () => ({ getDb: vi.fn() }))

import { createTestApp } from '../../helpers/test-app'
import creditsRoutes from '../../../src/routes/admin/credits'
import { getDb } from '../../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'update', 'set', 'returning', 'transaction', 'for']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

const now = new Date()
const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

describe('POST /api/admin/users/:id/credits', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(creditsRoutes)
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

  it('grants credits by creating a new pack', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }]) // user exists

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.returning.mockResolvedValueOnce([{
        id: 'cp-1', packName: 'Admin Grant', rcTotal: 50, rcRemaining: 50,
        priceGbp: '0', purchasedAt: now, expiresAt: futureDate,
      }])
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: 50, reason: 'Compensation for issue' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.adjustment.type).toBe('grant')
    expect(body.adjustment.rcAmount).toBe(50)
    expect(body.adjustment.creditPack.packName).toBe('Admin Grant')
  })

  it('creates audit log on grant', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.returning.mockResolvedValueOnce([{
        id: 'cp-1', packName: 'Admin Grant', rcTotal: 50, rcRemaining: 50,
        priceGbp: '0', purchasedAt: now, expiresAt: futureDate,
      }])
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: 50, reason: 'Grant for testing' },
    })

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'credits.grant' }),
    )
  })

  it('corrects credits by deducting FIFO from packs', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      // Packs with remaining credits
      tx.for.mockResolvedValueOnce([
        { id: 'cp-1', packName: 'Starter', rcRemaining: 30, expiresAt: futureDate },
        { id: 'cp-2', packName: 'Bonus', rcRemaining: 40, expiresAt: futureDate },
      ])
      tx.where.mockReturnValue(tx)
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: -20, reason: 'Correction for duplicate' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json()
    expect(body.adjustment.type).toBe('correction')
    expect(body.adjustment.rcDeducted).toBe(20)
  })

  it('rejects correction when insufficient credits', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.for.mockResolvedValueOnce([
        { id: 'cp-1', packName: 'Starter', rcRemaining: 5, expiresAt: futureDate },
      ])
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: -20, reason: 'Too much deduction' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INSUFFICIENT_CREDITS')
  })

  it('creates audit log on correction', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.for.mockResolvedValueOnce([
        { id: 'cp-1', packName: 'Starter', rcRemaining: 30, expiresAt: futureDate },
      ])
      tx.where.mockReturnValue(tx)
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: -10, reason: 'Correction' },
    })

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'credits.correction' }),
    )
  })

  it('rejects zero amount', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: 0, reason: 'Zero' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects non-integer amount', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: 10.5, reason: 'Fractional' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects missing reason', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: 10 },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects reason longer than 500 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: 10, reason: 'x'.repeat(501) },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects nonexistent user', async () => {
    mockDb.limit.mockResolvedValueOnce([]) // no user

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/nonexistent/credits',
      payload: { rcAmount: 10, reason: 'Grant' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error.code).toBe('USER_NOT_FOUND')
  })

  it('handles negative correction at exact available boundary', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'u-1' }])

    mockDb.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = createMockDb()
      tx.for.mockResolvedValueOnce([
        { id: 'cp-1', packName: 'Starter', rcRemaining: 20, expiresAt: futureDate },
      ])
      tx.where.mockReturnValue(tx)
      mockLogAdminAction.mockResolvedValueOnce(undefined)
      return fn(tx)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/u-1/credits',
      payload: { rcAmount: -20, reason: 'Exact deduction' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().adjustment.rcDeducted).toBe(20)
  })
})
