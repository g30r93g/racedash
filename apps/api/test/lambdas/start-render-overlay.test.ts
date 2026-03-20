import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
let isSelectChain = false
const mockDb: any = {}
const chainMethods = ['from', 'where', 'orderBy']
for (const m of chainMethods) mockDb[m] = vi.fn().mockReturnValue(mockDb)

// update() starts an update chain (not iterable)
mockDb.update = vi.fn().mockImplementation(() => { isSelectChain = false; return mockDb })
mockDb.set = vi.fn().mockReturnValue(mockDb)
// select() starts a select chain (iterable result expected)
mockDb.select = vi.fn().mockImplementation(() => { isSelectChain = true; return mockDb })
// limit() returns array when in select chain, mockDb otherwise
mockDb.limit = vi.fn()

const mockRenderMediaOnLambda = vi.fn().mockResolvedValue({ renderId: 'render-abc' })

vi.mock('@racedash/db', () => ({
  jobs: { id: 'id', config: 'config', renderTaskToken: 'renderTaskToken', remotionRenderId: 'remotionRenderId', updatedAt: 'updatedAt' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
}))

vi.mock('../../../../infra/lambdas/shared/db', () => ({
  getDb: () => mockDb,
}))

vi.mock('@remotion/lambda/client', () => ({
  renderMediaOnLambda: (...args: any[]) => mockRenderMediaOnLambda(...args),
}))

import { handler } from '../../../../infra/lambdas/start-render-overlay/index'

const JOB_CONFIG = {
  resolution: '1920x1080',
  frameRate: '30',
  renderMode: 'cloud',
  overlayStyle: 'classic-hud',
  config: { someKey: 'someVal' },
  sourceVideo: { width: 1920, height: 1080, fps: 30, durationSeconds: 120, fileSizeBytes: 1_000_000 },
  projectName: 'Test Project',
  sessionType: 'practice',
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('start-render-overlay handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isSelectChain = false

    // limit() returns the job config array when in a select chain
    mockDb.limit.mockImplementation(() => {
      if (isSelectChain) return Promise.resolve([{ config: JOB_CONFIG }])
      return mockDb
    })

    process.env.REMOTION_SERVE_URL = 'https://serve.example.com'
    process.env.REMOTION_FUNCTION_NAME = 'render-fn'
    process.env.REMOTION_WEBHOOK_URL = 'https://webhook.example.com'
    process.env.REMOTION_WEBHOOK_SECRET = 'wh-secret'
    process.env.AWS_REGION = 'eu-west-2'
  })

  it('calls renderMediaOnLambda with correct params', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    expect(mockRenderMediaOnLambda).toHaveBeenCalledWith(
      expect.objectContaining({
        serveUrl: 'https://serve.example.com',
        functionName: 'render-fn',
        composition: 'classic-hud',
      }),
    )
  })

  it('passes webhook URL and secret', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    const callArgs = mockRenderMediaOnLambda.mock.calls[0][0]
    expect(callArgs.webhook.url).toBe('https://webhook.example.com')
    expect(callArgs.webhook.secret).toBe('wh-secret')
  })

  it('passes taskToken in customData', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    const callArgs = mockRenderMediaOnLambda.mock.calls[0][0]
    expect(callArgs.webhook.customData).toEqual(
      expect.objectContaining({ taskToken: 'tok-1' }),
    )
  })

  it('stores renderId on the job', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    // The last set() call should contain the renderId
    const setCalls = mockDb.set.mock.calls
    const lastSet = setCalls[setCalls.length - 1][0]
    expect(lastSet.remotionRenderId).toBe('render-abc')
  })

  it('stores renderTaskToken on the job', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    // The first set() call stores the render task token
    const firstSet = mockDb.set.mock.calls[0][0]
    expect(firstSet.renderTaskToken).toBe('tok-1')
  })

  it('uses prores codec', async () => {
    await handler({ jobId: 'job-1', userId: 'user-1', taskToken: 'tok-1' })

    const callArgs = mockRenderMediaOnLambda.mock.calls[0][0]
    expect(callArgs.codec).toBe('prores')
  })
})
