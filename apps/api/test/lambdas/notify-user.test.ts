import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockDb: any = {}
const chainMethods = ['select', 'from', 'where', 'limit', 'orderBy', 'update', 'set']
for (const m of chainMethods) mockDb[m] = vi.fn().mockReturnValue(mockDb)

const mockSendEmail = vi.fn()

vi.mock('@racedash/db', () => ({
  jobs: { id: 'id', config: 'config' },
  users: { id: 'id', email: 'email' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
}))

vi.mock('../../../../infra/lambdas/shared/db', () => ({
  getDb: () => mockDb,
}))

vi.mock('../../../../infra/lambdas/shared/ses', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

import { handler } from '../../../../infra/lambdas/notify-user/index'

// ── Tests ────────────────────────────────────────────────────────────────────
describe('notify-user handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    let limitCalls = 0
    mockDb.limit.mockImplementation(() => {
      limitCalls++
      // First limit: user lookup
      if (limitCalls === 1) return Promise.resolve([{ email: 'user@example.com' }])
      // Second limit: job config
      return Promise.resolve([{ config: { projectName: 'Monaco GP' } }])
    })
  })

  it('sends email with correct subject line', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Your RaceDash render is ready' }))
  })

  it('looks up user email', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.com' }))
  })

  it('includes project name in the email body', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1' })

    const callArgs = mockSendEmail.mock.calls[0][0]
    expect(callArgs.body).toContain('Monaco GP')
  })

  it('uses SES_FROM_ADDRESS as the sender (via sendEmail helper)', async () => {
    // The sendEmail shared helper reads SES_FROM_ADDRESS internally.
    // We verify the handler delegates to the shared helper without overriding sender.
    await handler({ jobId: 'job-1', userId: 'user-1' })

    // sendEmail should be called exactly once with to, subject, body (no from override)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const callArgs = mockSendEmail.mock.calls[0][0]
    expect(callArgs).toHaveProperty('to')
    expect(callArgs).toHaveProperty('subject')
    expect(callArgs).toHaveProperty('body')
    // The sender is handled by the shared ses module using SES_FROM_ADDRESS
    expect(callArgs).not.toHaveProperty('from')
  })
})
