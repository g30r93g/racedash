import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockDb: any = {}
const chainMethods = ['select', 'from', 'where', 'limit', 'orderBy', 'update', 'set']
for (const m of chainMethods) mockDb[m] = vi.fn().mockReturnValue(mockDb)

const mockReleaseCredits = vi.fn()
const mockClaimNextQueuedSlotToken = vi.fn()
const mockSendTaskSuccess = vi.fn()
const mockSendEmail = vi.fn()

vi.mock('@racedash/db', () => ({
  jobs: { id: 'id', status: 'status', errorMessage: 'errorMessage', config: 'config', updatedAt: 'updatedAt' },
  users: { id: 'id', email: 'email' },
  releaseCredits: (...args: any[]) => mockReleaseCredits(...args),
  claimNextQueuedSlotToken: (...args: any[]) => mockClaimNextQueuedSlotToken(...args),
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
}))

vi.mock('../../../../infra/lambdas/shared/db', () => ({
  getDb: () => mockDb,
}))

vi.mock('../../../../infra/lambdas/shared/sfn', () => ({
  sendTaskSuccess: (...args: any[]) => mockSendTaskSuccess(...args),
}))

vi.mock('../../../../infra/lambdas/shared/ses', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

import { handler } from '../../../../infra/lambdas/release-credits-and-fail/index'

// ── Tests ────────────────────────────────────────────────────────────────────
describe('release-credits-and-fail handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClaimNextQueuedSlotToken.mockResolvedValue(null)

    let limitCalls = 0
    mockDb.limit.mockImplementation(() => {
      limitCalls++
      // First limit: user lookup (inside try/catch SES block)
      if (limitCalls === 1) return Promise.resolve([{ email: 'user@example.com' }])
      // Second limit: job config
      return Promise.resolve([{ config: { projectName: 'Spa Practice' } }])
    })
  })

  it('calls releaseCredits', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })

    expect(mockReleaseCredits).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }))
  })

  it('sets status to failed', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })

    expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('stores the error message', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })

    expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ errorMessage: 'render timeout' }))
  })

  it('sends a failure notification email via SES', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Your RaceDash render failed' }))
  })

  it('catches SES errors without throwing', async () => {
    mockSendEmail.mockRejectedValue(new Error('SES down'))

    // Should NOT throw
    await expect(handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })).resolves.not.toThrow()
  })

  it('calls claimNextQueuedSlotToken', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })

    expect(mockClaimNextQueuedSlotToken).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }))
  })

  it('sends SendTaskSuccess when a queued token is claimed', async () => {
    mockClaimNextQueuedSlotToken.mockResolvedValue('queued-tok')

    await handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })

    expect(mockSendTaskSuccess).toHaveBeenCalledWith('queued-tok')
  })

  it('does NOT call SendTaskSuccess when no queued token exists', async () => {
    mockClaimNextQueuedSlotToken.mockResolvedValue(null)

    await handler({ jobId: 'job-1', userId: 'user-1', error: 'render timeout' })

    expect(mockSendTaskSuccess).not.toHaveBeenCalled()
  })
})
