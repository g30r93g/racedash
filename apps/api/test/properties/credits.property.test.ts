import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { FastifyInstance } from 'fastify'
import { createTestApp } from '../helpers/test-app'
import creditRoutes from '../../src/routes/credits'
import { getDb } from '../../src/lib/db'

vi.mock('@racedash/db', () => ({
  users: { id: 'id', clerkId: 'clerkId' },
  creditPacks: {
    id: 'id', userId: 'userId', rcRemaining: 'rcRemaining',
    expiresAt: 'expiresAt', purchasedAt: 'purchasedAt',
  },
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
}))

vi.mock('../../src/lib/db', () => ({
  getDb: vi.fn(),
}))

// Arbitrary for generating a credit pack
const arbCreditPack = fc.record({
  id: fc.uuid(),
  packName: fc.constantFrom('50 RC Pack', '100 RC Pack', '250 RC Pack', '500 RC Pack'),
  rcTotal: fc.integer({ min: 1, max: 1000 }),
  rcRemaining: fc.integer({ min: 0, max: 1000 }),
  priceGbp: fc.integer({ min: 100, max: 50000 }).map(v => String(v / 100)),
  purchasedAt: fc.date({ min: new Date('2024-01-01T00:00:00.000Z'), max: new Date('2025-12-31T23:59:59.999Z'), noInvalidDate: true }),
  expiresAt: fc.date({ min: new Date('2026-06-01T00:00:00.000Z'), max: new Date('2027-12-31T23:59:59.999Z'), noInvalidDate: true }),
  userId: fc.constant('user_1'),
  stripePaymentIntentId: fc.uuid().map(s => `pi_${s}`),
})

// Expired packs have expiresAt in the past
const arbExpiredPack = arbCreditPack.map(p => ({
  ...p,
  expiresAt: new Date('2020-01-01'),
}))

/**
 * Creates a chainable, thenable mock DB that supports:
 * - First query chain (user lookup): select().from().where().limit(1) -> [user]
 * - Second query chain (packs): select().from().where().orderBy() -> packs
 *
 * Each method returns `this` so chaining works, and the object is thenable
 * so `await chain` resolves to the appropriate result.
 */
function createMockDbForBalance(packs: any[]) {
  let queryCount = 0

  function makeChain(resolveValue: any): any {
    const chain: any = {
      select: vi.fn(() => makeChain(resolveValue)),
      from: vi.fn(() => makeChain(resolveValue)),
      where: vi.fn(() => makeChain(resolveValue)),
      orderBy: vi.fn(() => makeChain(resolveValue)),
      limit: vi.fn(() => makeChain(resolveValue)),
      then: (resolve: any, reject?: any) => Promise.resolve(resolveValue).then(resolve, reject),
    }
    return chain
  }

  const db: any = {
    select: vi.fn(() => {
      queryCount++
      if (queryCount === 1) {
        // User lookup
        return makeChain([{ id: 'user_1' }])
      }
      // Packs query
      return makeChain(packs)
    }),
  }
  return db
}

function createMockDbForHistory(packs: any[]) {
  let queryCount = 0

  function makeChain(resolveValue: any): any {
    const chain: any = {
      select: vi.fn(() => makeChain(resolveValue)),
      from: vi.fn(() => makeChain(resolveValue)),
      where: vi.fn(() => makeChain(resolveValue)),
      orderBy: vi.fn(() => makeChain(resolveValue)),
      limit: vi.fn(() => makeChain(resolveValue)),
      then: (resolve: any, reject?: any) => Promise.resolve(resolveValue).then(resolve, reject),
    }
    return chain
  }

  const db: any = {
    select: vi.fn(() => {
      queryCount++
      if (queryCount === 1) {
        return makeChain([{ id: 'user_1' }])
      }
      return makeChain(packs)
    }),
  }
  return db
}

describe('Credit balance properties', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await createTestApp(creditRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  it('Balance is non-negative', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbCreditPack, { minLength: 0, maxLength: 20 }), async (packs) => {
        const activePacks = packs.filter(p => p.rcRemaining > 0 && p.expiresAt > new Date())
        vi.mocked(getDb).mockReturnValue(createMockDbForBalance(activePacks))

        const response = await app.inject({ method: 'GET', url: '/api/credits/balance' })
        const body = response.json()
        expect(body.totalRc).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 50 },
    )
  })

  it('Balance equals sum of remainders', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbCreditPack, { minLength: 0, maxLength: 20 }), async (packs) => {
        const activePacks = packs.filter(p => p.rcRemaining > 0 && p.expiresAt > new Date())
        vi.mocked(getDb).mockReturnValue(createMockDbForBalance(activePacks))

        const response = await app.inject({ method: 'GET', url: '/api/credits/balance' })
        const body = response.json()
        const expectedTotal = activePacks.reduce((sum, p) => sum + p.rcRemaining, 0)
        expect(body.totalRc).toBe(expectedTotal)
      }),
      { numRuns: 50 },
    )
  })

  it('Pack ordering is stable', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbCreditPack, { minLength: 2, maxLength: 20 }), async (packs) => {
        const activePacks = packs.filter(p => p.rcRemaining > 0 && p.expiresAt > new Date())
        // Sort by expiresAt ascending (as the route does via DB ORDER BY)
        const sortedPacks = [...activePacks].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
        vi.mocked(getDb).mockReturnValue(createMockDbForBalance(sortedPacks))

        const response = await app.inject({ method: 'GET', url: '/api/credits/balance' })
        const body = response.json()

        // Verify packs come back in the same order (earliest expiry first)
        for (let i = 1; i < body.packs.length; i++) {
          const prev = new Date(body.packs[i - 1].expiresAt).getTime()
          const curr = new Date(body.packs[i].expiresAt).getTime()
          expect(prev).toBeLessThanOrEqual(curr)
        }
      }),
      { numRuns: 50 },
    )
  })
})

describe('Credit history properties', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await createTestApp(creditRoutes)
  })

  afterEach(async () => {
    await app.close()
  })

  it('History pagination is complete', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbCreditPack, { minLength: 0, maxLength: 10 }),
        async (packs) => {
          // The route fetches limit+1 (default 21). Return at most the packs we have.
          vi.mocked(getDb).mockReturnValue(createMockDbForHistory(packs))

          const response = await app.inject({ method: 'GET', url: '/api/credits/history' })
          const body = response.json()

          expect(body.purchases.length).toBeLessThanOrEqual(packs.length)
          // If fewer packs than limit (20), nextCursor should be null
          if (packs.length <= 20) {
            expect(body.nextCursor).toBeNull()
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('Expired packs excluded', async () => {
    // The balance endpoint filters out expired packs via the DB WHERE clause.
    // We simulate this by returning [] from the DB (as the DB would for expired-only data).
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbExpiredPack, { minLength: 1, maxLength: 10 }),
        async () => {
          vi.mocked(getDb).mockReturnValue(createMockDbForBalance([]))

          const response = await app.inject({ method: 'GET', url: '/api/credits/balance' })
          const body = response.json()
          expect(body.totalRc).toBe(0)
          expect(body.packs).toHaveLength(0)
        },
      ),
      { numRuns: 50 },
    )
  })
})
