import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ── 1. Admin role exhaustiveness ──────────────────────────────────────────
// The admin-auth plugin accepts ONLY role === 'admin'. Any other string must
// result in a 403. We replicate the guard logic here to property-test it in
// isolation without needing a live Fastify instance or Clerk client.

const ALLOWED_ROLE = 'admin' as const

function evaluateAdminGuard(role: string): { allowed: boolean; status: 401 | 403 | null } {
  if (role === ALLOWED_ROLE) return { allowed: true, status: null }
  return { allowed: false, status: 403 }
}

describe('admin-auth property tests', () => {
  it('rejects any role string that is not "admin" with 403', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== 'admin'),
        (role) => {
          const result = evaluateAdminGuard(role)
          expect(result.allowed).toBe(false)
          expect(result.status).toBe(403)
        },
      ),
      { numRuns: 200 },
    )
  })

  // ── 2. Pagination invariant ──────────────────────────────────────────────
  // For any finite dataset, cursor-based pagination must terminate: nextCursor
  // eventually becomes null.

  it('pagination terminates for any finite user list', () => {
    fc.assert(
      fc.property(
        // Generate a list of 0..200 mock user IDs (sorted, as the real query uses ORDER BY id ASC)
        fc.array(fc.uuid(), { minLength: 0, maxLength: 200 }).map((ids) => [...new Set(ids)].sort()),
        // Page size between 1 and 100 (matches the real clamp in userSearchSchema)
        fc.integer({ min: 1, max: 100 }),
        (allUserIds, pageSize) => {
          // Simulate the cursor-based pagination from users.ts
          let cursor: string | null = null
          let totalSeen = 0
          const maxIterations = allUserIds.length + 2 // safety bound

          for (let i = 0; i < maxIterations; i++) {
            // Filter by cursor
            const eligible = cursor ? allUserIds.filter((id) => id > cursor!) : allUserIds

            const page = eligible.slice(0, pageSize)
            const hasMore = eligible.length > pageSize

            totalSeen += page.length
            cursor = hasMore ? page[page.length - 1] : null

            if (cursor === null) break
          }

          // Pagination must have terminated
          expect(cursor).toBeNull()
          // We must have seen every user exactly once
          expect(totalSeen).toBe(allUserIds.length)
        },
      ),
      { numRuns: 150 },
    )
  })

  // ── 3. Credit correction bound ───────────────────────────────────────────
  // The FIFO deduction algorithm in credits.ts must never make a user's total
  // RC go below 0. If the correction exceeds available credits, it should be
  // rejected (returns { error: ... }).

  interface MockPack {
    id: string
    rcRemaining: number
  }

  function simulateCorrection(
    packs: MockPack[],
    absAmount: number,
  ): { error: true; totalAvailable: number } | { deducted: number; packStates: MockPack[] } {
    const totalAvailable = packs.reduce((sum, p) => sum + p.rcRemaining, 0)
    if (totalAvailable < absAmount) {
      return { error: true, totalAvailable }
    }

    // Clone packs for mutation (FIFO order - packs are pre-sorted by expiresAt)
    const cloned = packs.map((p) => ({ ...p }))
    let remaining = absAmount

    for (const pack of cloned) {
      if (remaining === 0) break
      const deduct = Math.min(remaining, pack.rcRemaining)
      pack.rcRemaining -= deduct
      remaining -= deduct
    }

    return { deducted: absAmount, packStates: cloned }
  }

  it('credit correction never makes any pack go below 0 RC', () => {
    const packArb = fc.record({
      id: fc.uuid(),
      rcRemaining: fc.integer({ min: 0, max: 10_000 }),
    })

    fc.assert(
      fc.property(
        fc.array(packArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 1, max: 50_000 }),
        (packs, correctionAmount) => {
          const result = simulateCorrection(packs, correctionAmount)

          if ('error' in result) {
            // Rejection case: correction exceeded available
            const totalAvailable = packs.reduce((sum, p) => sum + p.rcRemaining, 0)
            expect(result.totalAvailable).toBe(totalAvailable)
            expect(correctionAmount).toBeGreaterThan(totalAvailable)
          } else {
            // Success case: no pack went below 0
            for (const pack of result.packStates) {
              expect(pack.rcRemaining).toBeGreaterThanOrEqual(0)
            }
            // Total deducted equals requested amount
            const totalBefore = packs.reduce((sum, p) => sum + p.rcRemaining, 0)
            const totalAfter = result.packStates.reduce((sum, p) => sum + p.rcRemaining, 0)
            expect(totalBefore - totalAfter).toBe(correctionAmount)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
