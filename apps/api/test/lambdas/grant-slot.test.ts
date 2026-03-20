import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockDb: any = {}
const chainMethods = ['select', 'from', 'where', 'limit', 'orderBy', 'update', 'set']
for (const m of chainMethods) mockDb[m] = vi.fn().mockReturnValue(mockDb)

vi.mock('@racedash/db', () => ({
  jobs: { id: 'id', status: 'status', updatedAt: 'updatedAt' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
}))

vi.mock('../../../../infra/lambdas/shared/db', () => ({
  getDb: () => mockDb,
}))

import { handler } from '../../../../infra/lambdas/grant-slot/index'

// ── Tests ────────────────────────────────────────────────────────────────────
describe('grant-slot handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates job status to rendering', async () => {
    await handler({ jobId: 'job-1' })

    expect(mockDb.update).toHaveBeenCalled()
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rendering' }),
    )
  })

  it('sets the updatedAt timestamp', async () => {
    const before = Date.now()
    await handler({ jobId: 'job-1' })

    const setArg = mockDb.set.mock.calls[0][0]
    expect(setArg.updatedAt).toBeInstanceOf(Date)
    expect(setArg.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})
