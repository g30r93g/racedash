import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.YOUTUBE_CLIENT_ID = 'test-client-id'
process.env.YOUTUBE_CLIENT_SECRET = 'test-client-secret'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  licenses: { id: 'id', userId: 'userId', status: 'status', expiresAt: 'expiresAt' },
  connectedAccounts: {
    id: 'id', userId: 'userId', platform: 'platform',
    accountName: 'accountName', accountId: 'accountId',
    accessToken: 'accessToken', refreshToken: 'refreshToken',
    connectedAt: 'connectedAt', lastUsedAt: 'lastUsedAt',
  },
  eq: vi.fn(), and: vi.fn(), gt: vi.fn(), desc: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({ getDb: vi.fn() }))
vi.mock('../../src/lib/token-crypto', () => ({
  encryptToken: vi.fn((s: string) => `encrypted:${s}`),
  decryptToken: vi.fn((s: string) => s.replace('encrypted:', '')),
}))

import { createTestApp } from '../helpers/test-app'
import youtubeAuthRoutes from '../../src/routes/youtube-auth'
import { getDb } from '../../src/lib/db'

const mockedGetDb = vi.mocked(getDb)

function createMockDb() {
  const mockDb: any = {}
  const methods = ['select', 'from', 'where', 'limit', 'orderBy', 'insert', 'values', 'update', 'set', 'delete', 'returning']
  for (const m of methods) {
    mockDb[m] = vi.fn().mockReturnValue(mockDb)
  }
  return mockDb
}

describe('Snapshot: YouTube Status & Disconnect', () => {
  let app: FastifyInstance
  let mockDb: ReturnType<typeof createMockDb>

  beforeAll(async () => {
    app = await createTestApp(youtubeAuthRoutes)
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

  it('GET /auth/youtube/status (connected) shape', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{
      accountName: 'G. Gorzynski Racing',
      accountId: 'UC_test',
      connectedAt: new Date('2026-03-18T12:00:00.000Z'),
    }])

    const response = await app.inject({ method: 'GET', url: '/api/auth/youtube/status' })
    expect(response.json()).toMatchInlineSnapshot(`
      {
        "account": {
          "accountId": "UC_test",
          "accountName": "G. Gorzynski Racing",
          "connectedAt": "2026-03-18T12:00:00.000Z",
        },
        "connected": true,
      }
    `)
  })

  it('GET /auth/youtube/status (not connected) shape', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([])

    const response = await app.inject({ method: 'GET', url: '/api/auth/youtube/status' })
    expect(response.json()).toMatchInlineSnapshot(`
      {
        "account": null,
        "connected": false,
      }
    `)
  })

  it('DELETE /auth/youtube/disconnect shape', async () => {
    mockDb.limit.mockResolvedValueOnce([{ id: 'user-1' }])
    mockDb.limit.mockResolvedValueOnce([{ id: 'ca-1' }])

    const response = await app.inject({ method: 'DELETE', url: '/api/auth/youtube/disconnect' })
    expect(response.json()).toMatchInlineSnapshot(`
      {
        "disconnected": true,
      }
    `)
  })
})
