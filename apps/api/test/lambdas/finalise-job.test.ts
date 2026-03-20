import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockDb: any = {}
const chainMethods = ['select', 'from', 'where', 'limit', 'orderBy', 'update', 'set']
for (const m of chainMethods) mockDb[m] = vi.fn().mockReturnValue(mockDb)

const mockConsumeCredits = vi.fn()
const mockClaimNextQueuedSlotToken = vi.fn()
const mockSendTaskSuccess = vi.fn()
const mockDeleteObject = vi.fn()

vi.mock('@racedash/db', () => ({
  jobs: { id: 'id', status: 'status', outputS3Key: 'outputS3Key', downloadExpiresAt: 'downloadExpiresAt', updatedAt: 'updatedAt' },
  consumeCredits: (...args: any[]) => mockConsumeCredits(...args),
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

vi.mock('../../../../infra/lambdas/shared/s3', () => ({
  deleteObject: (...args: any[]) => mockDeleteObject(...args),
}))

import { handler } from '../../../../infra/lambdas/finalise-job/index'

// ── Tests ────────────────────────────────────────────────────────────────────
describe('finalise-job handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClaimNextQueuedSlotToken.mockResolvedValue(null)
    process.env.S3_UPLOAD_BUCKET = 'upload-bucket'
  })

  it('calls consumeCredits', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockConsumeCredits).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1' }),
    )
  })

  it('sets status to complete', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete' }),
    )
  })

  it('sets download_expires_at approximately 7 days from now', async () => {
    const before = Date.now()
    await handler({ jobId: 'job-1', userId: 'user-1' })

    const setArg = mockDb.set.mock.calls[0][0]
    const expiresAt = setArg.downloadExpiresAt as Date
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    // Allow 5 seconds tolerance
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs - 5000)
    expect(expiresAt.getTime()).toBeLessThanOrEqual(before + sevenDaysMs + 5000)
  })

  it('sets outputS3Key to renders/{jobId}/output.mp4', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ outputS3Key: 'renders/job-1/output.mp4' }),
    )
  })

  it('deletes the source upload from S3', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockDeleteObject).toHaveBeenCalledWith('upload-bucket', 'uploads/job-1/joined.mp4')
  })

  it('calls claimNextQueuedSlotToken', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockClaimNextQueuedSlotToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    )
  })

  it('sends SendTaskSuccess when a queued token is claimed', async () => {
    mockClaimNextQueuedSlotToken.mockResolvedValue('queued-tok')

    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockSendTaskSuccess).toHaveBeenCalledWith('queued-tok')
  })

  it('does NOT call SendTaskSuccess when no queued token exists', async () => {
    mockClaimNextQueuedSlotToken.mockResolvedValue(null)

    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockSendTaskSuccess).not.toHaveBeenCalled()
  })
})
