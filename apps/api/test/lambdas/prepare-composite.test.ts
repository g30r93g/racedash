import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockDb: any = {}
const chainMethods = ['select', 'from', 'where', 'limit', 'orderBy', 'update', 'set']
for (const m of chainMethods) mockDb[m] = vi.fn().mockReturnValue(mockDb)

vi.mock('@racedash/db', () => ({
  jobs: { id: 'id', config: 'config', status: 'status', updatedAt: 'updatedAt' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
}))

vi.mock('../../../../infra/lambdas/shared/db', () => ({
  getDb: () => mockDb,
}))

import { handler } from '../../../../infra/lambdas/prepare-composite/index'

function makeConfig(width: number) {
  return {
    sourceVideo: { width, height: (width * 9) / 16, fps: 30, durationSeconds: 60, fileSizeBytes: 500_000 },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('prepare-composite handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.S3_UPLOAD_BUCKET = 'upload-bucket'
    process.env.S3_RENDERS_BUCKET = 'renders-bucket'
    process.env.MEDIACONVERT_ROLE_ARN = 'arn:aws:iam::123456:role/MediaConvert'

    // First call: update (status). Second call: select (config).
    let callCount = 0
    mockDb.limit.mockImplementation(() => {
      callCount++
      if (callCount >= 1) return Promise.resolve([{ config: makeConfig(1920) }])
      return mockDb
    })
    mockDb.where.mockReturnValue(mockDb)
    mockDb.set.mockReturnValue(mockDb)
  })

  it('sets status to compositing', async () => {
    await handler({ jobId: 'job-1' })

    expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'compositing' }))
  })

  it('returns correct input S3 keys', async () => {
    const result = await handler({ jobId: 'job-1' })

    const inputs = result.mediaConvertSettings.Inputs
    expect(inputs[0].FileInput).toBe('s3://upload-bucket/uploads/job-1/joined.mp4')
    expect(inputs[1].FileInput).toBe('s3://renders-bucket/renders/job-1/overlay.mov')
  })

  it('selects 50 Mbps bitrate for width >= 3840', async () => {
    mockDb.limit.mockResolvedValue([{ config: makeConfig(3840) }])

    const result = await handler({ jobId: 'job-1' })

    const bitrate =
      result.mediaConvertSettings.OutputGroups[0].Outputs[0].VideoDescription.CodecSettings.H264Settings.Bitrate
    expect(bitrate).toBe(50_000_000)
  })

  it('selects 30 Mbps bitrate for width >= 2560', async () => {
    mockDb.limit.mockResolvedValue([{ config: makeConfig(2560) }])

    const result = await handler({ jobId: 'job-1' })

    const bitrate =
      result.mediaConvertSettings.OutputGroups[0].Outputs[0].VideoDescription.CodecSettings.H264Settings.Bitrate
    expect(bitrate).toBe(30_000_000)
  })

  it('selects 20 Mbps bitrate for width < 2560', async () => {
    mockDb.limit.mockResolvedValue([{ config: makeConfig(1920) }])

    const result = await handler({ jobId: 'job-1' })

    const bitrate =
      result.mediaConvertSettings.OutputGroups[0].Outputs[0].VideoDescription.CodecSettings.H264Settings.Bitrate
    expect(bitrate).toBe(20_000_000)
  })

  it('sets output destination under renders/{jobId}/output', async () => {
    const result = await handler({ jobId: 'job-1' })

    const dest = result.mediaConvertSettings.OutputGroups[0].OutputGroupSettings.FileGroupSettings.Destination
    expect(dest).toBe('s3://renders-bucket/renders/job-1/output')
  })

  it('includes MediaConvert role ARN', async () => {
    const result = await handler({ jobId: 'job-1' })

    expect(result.mediaConvertRoleArn).toBe('arn:aws:iam::123456:role/MediaConvert')
  })
})
