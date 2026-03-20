import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockDb: any = {}
const chainMethods = ['select', 'from', 'where', 'limit', 'orderBy', 'update', 'set', 'insert', 'values']
for (const m of chainMethods) mockDb[m] = vi.fn().mockReturnValue(mockDb)

const mockSendTaskSuccess = vi.fn()
const mockSendTaskFailure = vi.fn()
const mockCountActiveRenders = vi.fn()
const mockGetSlotLimit = vi.fn()

vi.mock('@racedash/db', () => ({
  jobs: { id: 'id', slotTaskToken: 'slotTaskToken', updatedAt: 'updatedAt' },
  licenses: {
    id: 'id',
    userId: 'userId',
    status: 'status',
    expiresAt: 'expiresAt',
    tier: 'tier',
  },
  countActiveRenders: (...args: any[]) => mockCountActiveRenders(...args),
  getSlotLimit: (...args: any[]) => mockGetSlotLimit(...args),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  and: vi.fn((...args: any[]) => ({ and: args })),
  gt: vi.fn((_col, val) => ({ gt: val })),
  desc: vi.fn((col) => ({ desc: col })),
}))

vi.mock('../../../../infra/lambdas/shared/db', () => ({
  getDb: () => mockDb,
}))

vi.mock('../../../../infra/lambdas/shared/sfn', () => ({
  sendTaskSuccess: (...args: any[]) => mockSendTaskSuccess(...args),
  sendTaskFailure: (...args: any[]) => mockSendTaskFailure(...args),
}))

import { handler } from '../../../../infra/lambdas/wait-for-slot/index'

// ── Tests ────────────────────────────────────────────────────────────────────
describe('wait-for-slot handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: valid license, 0 active renders
    mockDb.limit.mockResolvedValue([{ tier: 'plus' }])
    mockGetSlotLimit.mockReturnValue(1)
    mockCountActiveRenders.mockResolvedValue(0)
  })

  it('sends SendTaskSuccess immediately when a slot is available', async () => {
    mockCountActiveRenders.mockResolvedValue(0)
    mockGetSlotLimit.mockReturnValue(1)

    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    expect(mockSendTaskSuccess).toHaveBeenCalledWith('tok-1')
  })

  it('does NOT call SendTaskSuccess when no slot is available', async () => {
    mockCountActiveRenders.mockResolvedValue(1)
    mockGetSlotLimit.mockReturnValue(1)

    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    expect(mockSendTaskSuccess).not.toHaveBeenCalled()
  })

  it('stores taskToken in slotTaskToken on the job', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    expect(mockDb.update).toHaveBeenCalled()
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ slotTaskToken: 'tok-1' }),
    )
  })

  it('Plus tier has slot limit of 1', async () => {
    mockDb.limit.mockResolvedValue([{ tier: 'plus' }])

    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    expect(mockGetSlotLimit).toHaveBeenCalledWith('plus')
  })

  it('Pro tier has slot limit of 3', async () => {
    mockDb.limit.mockResolvedValue([{ tier: 'pro' }])
    mockGetSlotLimit.mockReturnValue(3)
    mockCountActiveRenders.mockResolvedValue(2)

    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    expect(mockGetSlotLimit).toHaveBeenCalledWith('pro')
    expect(mockSendTaskSuccess).toHaveBeenCalledWith('tok-1')
  })
})
