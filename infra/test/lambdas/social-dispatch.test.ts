interface SQSRecord {
  messageId: string
  receiptHandle: string
  body: string
  attributes: Record<string, string>
  messageAttributes: Record<string, unknown>
  md5OfBody: string
  eventSource: string
  eventSourceARN: string
  awsRegion: string
}

interface SQSEvent {
  Records: SQSRecord[]
}

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSend = jest.fn().mockResolvedValue({})

jest.mock('@aws-sdk/client-ecs', () => ({
  ECSClient: jest.fn(() => ({ send: mockSend })),
  RunTaskCommand: jest.fn((input: unknown) => ({ _input: input })),
}))

const mockDbUpdate = jest.fn().mockReturnThis()
const mockDbSet = jest.fn().mockReturnThis()
const mockDbWhere = jest.fn().mockResolvedValue(undefined)

jest.mock('@racedash/db', () => ({
  createDb: jest.fn(() => ({
    update: mockDbUpdate,
  })),
  socialUploads: { id: 'social_uploads.id' },
}))

// Chain the fluent DB calls
mockDbUpdate.mockReturnValue({ set: mockDbSet })
mockDbSet.mockReturnValue({ where: mockDbWhere })

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSqsEvent(body: Record<string, unknown>): SQSEvent {
  return {
    Records: [
      {
        messageId: 'msg-1',
        receiptHandle: 'rh-1',
        body: JSON.stringify(body),
        attributes: {} as any,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:queue',
        awsRegion: 'us-east-1',
      },
    ],
  }
}

const VALID_PAYLOAD = {
  socialUploadId: 'su-001',
  reservationKey: 'rk-001',
  jobId: 'job-001',
  userId: 'user-001',
  platform: 'youtube',
  outputS3Key: 'renders/output.mp4',
  metadata: { title: 'My Race', description: 'Great race', privacy: 'public' },
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.YOUTUBE_TASK_DEFINITION_ARN = 'arn:aws:ecs:us-east-1:123456789012:task-definition/yt-upload:1'
  process.env.ECS_CLUSTER_ARN = 'arn:aws:ecs:us-east-1:123456789012:cluster/social'
  process.env.TASK_SUBNETS = 'subnet-aaa,subnet-bbb'
  process.env.TASK_SECURITY_GROUP = 'sg-123'
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
})

beforeEach(() => {
  jest.clearAllMocks()
  // Re-wire fluent chain after clearAllMocks
  mockDbUpdate.mockReturnValue({ set: mockDbSet })
  mockDbSet.mockReturnValue({ where: mockDbWhere })
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('social-dispatch Lambda', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { handler } = require('../../lambdas/social-dispatch/index')

  test('launches Fargate task for platform=youtube with correct task definition ARN', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RunTaskCommand } = require('@aws-sdk/client-ecs')

    await handler(makeSqsEvent(VALID_PAYLOAD))

    expect(RunTaskCommand).toHaveBeenCalledTimes(1)
    const input = RunTaskCommand.mock.calls[0][0]
    expect(input.taskDefinition).toBe('arn:aws:ecs:us-east-1:123456789012:task-definition/yt-upload:1')
    expect(input.launchType).toBe('FARGATE')
  })

  test('passes full payload as UPLOAD_PAYLOAD container override env var', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RunTaskCommand } = require('@aws-sdk/client-ecs')

    await handler(makeSqsEvent(VALID_PAYLOAD))

    const input = RunTaskCommand.mock.calls[0][0]
    const containerOverrides = input.overrides.containerOverrides
    expect(containerOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'YouTubeUploadContainer',
          environment: expect.arrayContaining([
            expect.objectContaining({
              name: 'UPLOAD_PAYLOAD',
              value: JSON.stringify(VALID_PAYLOAD),
            }),
          ]),
        }),
      ]),
    )
  })

  test('updates social_uploads.status to "uploading" after successful RunTask', async () => {
    await handler(makeSqsEvent(VALID_PAYLOAD))

    expect(mockDbSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'uploading' }))
  })

  test('throws error for unrecognised platform (message goes to DLQ)', async () => {
    const badPayload = { ...VALID_PAYLOAD, platform: 'tiktok' }

    await expect(handler(makeSqsEvent(badPayload))).rejects.toThrow('Unsupported platform: tiktok')
  })

  test('parses SQS event record body as JSON', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RunTaskCommand } = require('@aws-sdk/client-ecs')

    const event = makeSqsEvent(VALID_PAYLOAD)
    await handler(event)

    // If JSON parsing failed we would never reach RunTaskCommand
    expect(RunTaskCommand).toHaveBeenCalledTimes(1)
  })
})
