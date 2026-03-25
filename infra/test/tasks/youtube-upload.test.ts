// ── Mocks (hoisted before imports) ─────────────────────────────────────────

const mockS3Send = jest.fn()
const mockSesSend = jest.fn().mockResolvedValue({})

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  GetObjectCommand: jest.fn((input: unknown) => ({ _type: 'GetObject', _input: input })),
  HeadObjectCommand: jest.fn((input: unknown) => ({ _type: 'HeadObject', _input: input })),
}))

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn((input: unknown) => ({ _type: 'SendEmail', _input: input })),
}))

// DB mock with fluent interface
const mockDbUpdateSet = jest.fn()
const mockDbUpdateSetWhere = jest.fn().mockResolvedValue(undefined)
const mockDbUpdate = jest.fn()
const mockDbSelectFrom = jest.fn()

const mockConsumeCredits = jest.fn().mockResolvedValue(undefined)
const mockReleaseCredits = jest.fn().mockResolvedValue(undefined)

jest.mock('@racedash/db', () => ({
  createDb: jest.fn(() => ({
    update: mockDbUpdate,
    select: jest.fn().mockReturnValue({ from: mockDbSelectFrom }),
  })),
  socialUploads: { id: 'social_uploads.id' },
  connectedAccounts: {
    userId: 'connected_accounts.userId',
    platform: 'connected_accounts.platform',
    accessToken: 'connected_accounts.accessToken',
    lastUsedAt: 'connected_accounts.lastUsedAt',
  },
  consumeCredits: (...args: unknown[]) => mockConsumeCredits(...args),
  releaseCredits: (...args: unknown[]) => mockReleaseCredits(...args),
  users: { id: 'users.id', email: 'users.email' },
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...args: unknown[]) => ({ _and: args })),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

import { Readable } from 'node:stream'

// A simple encryption key for tests (64 hex chars = 32 bytes)
const TEST_ENCRYPTION_KEY = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'

function encryptForTest(plaintext: string): string {
  const { createCipheriv, randomBytes } = require('node:crypto')
  const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

const VALID_PAYLOAD = {
  socialUploadId: 'su-001',
  reservationKey: 'rk-001',
  jobId: 'job-001',
  userId: 'user-001',
  platform: 'youtube' as const,
  outputS3Key: 'renders/output.mp4',
  metadata: { title: 'My Race', description: 'Great race', privacy: 'public' as const },
}

const MOCK_ACCOUNT = {
  id: 'ca-001',
  userId: 'user-001',
  platform: 'youtube',
  accessToken: encryptForTest('ya29.test-access-token'),
  refreshToken: encryptForTest('1//test-refresh-token'),
}

function makeReadableStream(data: Buffer): Readable {
  const stream = new Readable({
    read() {
      this.push(data)
      this.push(null)
    },
  })
  return stream
}

// Track all status updates
function captureStatusUpdates(): Array<{ status: string; [key: string]: unknown }> {
  const updates: Array<{ status: string; [key: string]: unknown }> = []
  mockDbUpdateSet.mockImplementation((setArg: Record<string, unknown>) => {
    updates.push(setArg as any)
    return { where: mockDbUpdateSetWhere }
  })
  return updates
}

// Setup fetch mock (global)
const mockFetch = jest.fn()

// ── Environment ────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
  process.env.S3_RENDERS_BUCKET = 'test-renders-bucket'
  process.env.YOUTUBE_CLIENT_ID = 'yt-client-id'
  process.env.YOUTUBE_CLIENT_SECRET = 'yt-client-secret'
  process.env.SES_FROM_ADDRESS = 'noreply@racedash.test'
})

let mockProcessExit: jest.SpyInstance
let processExitCalls: number[]

beforeEach(() => {
  jest.clearAllMocks()
  processExitCalls = []

  // Wire up fluent DB chain
  mockDbUpdate.mockReturnValue({ set: mockDbUpdateSet })
  mockDbUpdateSet.mockReturnValue({ where: mockDbUpdateSetWhere })

  // S3 HeadObject returns file size by default
  mockS3Send.mockImplementation((cmd: { _type: string }) => {
    if (cmd._type === 'HeadObject') {
      return Promise.resolve({ ContentLength: 1024 })
    }
    if (cmd._type === 'GetObject') {
      return Promise.resolve({ Body: makeReadableStream(Buffer.alloc(1024)) })
    }
    return Promise.resolve({})
  })

  // Mock process.exit to record calls without throwing — the main function
  // has a .catch() handler that calls process.exit again, creating a loop if we throw.
  mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    processExitCalls.push(code ?? 0)
  }) as any)

  // Mock global fetch
  global.fetch = mockFetch as any
})

afterEach(() => {
  mockProcessExit.mockRestore()
  jest.useRealTimers()
  delete process.env.UPLOAD_PAYLOAD
})

// ── Helper to run the main function ────────────────────────────────────────

async function runMain(): Promise<void> {
  jest.useFakeTimers()

  jest.isolateModules(() => {
    require('../../tasks/youtube-upload/index')
  })

  // Advance fake timers in increments until process.exit is called.
  // The youtube-upload task has a 10-second polling delay, so we need
  // fake timers to fast-forward through it.
  for (let i = 0; i < 200; i++) {
    if (processExitCalls.length > 0) break
    await jest.advanceTimersByTimeAsync(500)
  }
}

// Setup default select chain that handles both user and account lookups
function setupDefaultDbSelects() {
  let callCount = 0
  mockDbSelectFrom.mockImplementation(() => ({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve([{ email: 'user@test.com' }])
        return Promise.resolve([MOCK_ACCOUNT])
      }),
    }),
  }))
}

// Setup a successful upload flow (init -> chunk upload -> poll for processed)
function setupSuccessfulUploadFlow() {
  setupDefaultDbSelects()

  mockFetch.mockImplementation((url: string) => {
    // Resumable upload init
    if (typeof url === 'string' && url.includes('uploadType=resumable')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: (key: string) => key === 'Location' ? 'https://www.googleapis.com/upload/youtube/resume?upload_id=123' : null },
      })
    }

    // Chunk upload
    if (typeof url === 'string' && url.includes('resume?upload_id=')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'VIDEO_ID_123' }),
      })
    }

    // Poll for processing status
    if (typeof url === 'string' && url.includes('youtube/v3/videos?id=')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          items: [{ status: { uploadStatus: 'processed' } }],
        }),
      })
    }

    return Promise.resolve({ ok: true, status: 200 })
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('youtube-upload Fargate task', () => {
  test('streams S3 object to YouTube resumable upload endpoint', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupSuccessfulUploadFlow()

    await runMain()

    // Verify S3 GetObject was called
    expect(mockS3Send).toHaveBeenCalledWith(
      expect.objectContaining({ _type: 'GetObject' }),
    )

    // Verify YouTube upload endpoint was called with PUT
    const uploadCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => typeof url === 'string' && url.includes('resume?upload_id='),
    )
    expect(uploadCalls.length).toBeGreaterThanOrEqual(1)
  })

  test('sets video metadata (title, description, categoryId, privacyStatus) from payload', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupSuccessfulUploadFlow()

    await runMain()

    const initCall = mockFetch.mock.calls.find(
      ([url]: [string]) => typeof url === 'string' && url.includes('uploadType=resumable'),
    )
    expect(initCall).toBeDefined()

    const body = JSON.parse(initCall![1].body)
    expect(body.snippet.title).toBe('My Race')
    expect(body.snippet.description).toBe('Great race')
    expect(body.snippet.categoryId).toBe('17')
    expect(body.status.privacyStatus).toBe('public')
  })

  test('updates status to "processing" after upload bytes sent', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupSuccessfulUploadFlow()
    const statusUpdates = captureStatusUpdates()

    await runMain()

    const processingUpdate = statusUpdates.find((u) => u.status === 'processing')
    expect(processingUpdate).toBeDefined()
  })

  test('updates status to "live" and stores platform_url on success', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupSuccessfulUploadFlow()
    const statusUpdates = captureStatusUpdates()

    await runMain()

    const liveUpdate = statusUpdates.find((u) => u.status === 'live')
    expect(liveUpdate).toBeDefined()
    expect(liveUpdate!.platformUrl).toBe('https://youtube.com/watch?v=VIDEO_ID_123')
  })

  test('calls consumeCredits on successful upload', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupSuccessfulUploadFlow()

    await runMain()

    expect(mockConsumeCredits).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'rk-001' }),
    )
  })

  test('updates status to "failed" and stores error_message on failure', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
          headers: { get: () => null },
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    const statusUpdates = captureStatusUpdates()

    await runMain()

    const failedUpdate = statusUpdates.find((u) => u.status === 'failed')
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate!.errorMessage).toBeDefined()
  })

  test('calls releaseCredits on failed upload', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
          headers: { get: () => null },
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    await runMain()

    expect(mockReleaseCredits).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'rk-001' }),
    )
  })

  test('sends SES failure email on error', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
          headers: { get: () => null },
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    await runMain()

    expect(mockSesSend).toHaveBeenCalled()
  })

  test('refreshes access token on 401 and retries', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    let initCallCount = 0
    mockFetch.mockImplementation((url: string) => {
      // Token refresh endpoint
      if (typeof url === 'string' && url.includes('oauth2.googleapis.com/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'ya29.new-access-token' }),
        })
      }

      // Resumable upload init -- first call returns 401, retry succeeds
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        initCallCount++
        if (initCallCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: () => Promise.resolve('Unauthorized'),
            headers: { get: () => null },
          })
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: (key: string) => key === 'Location' ? 'https://www.googleapis.com/upload/youtube/resume?upload_id=456' : null },
        })
      }

      // Chunk upload
      if (typeof url === 'string' && url.includes('resume?upload_id=')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'VIDEO_ID_456' }),
        })
      }

      // Poll
      if (typeof url === 'string' && url.includes('youtube/v3/videos?id=')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            items: [{ status: { uploadStatus: 'processed' } }],
          }),
        })
      }

      return Promise.resolve({ ok: true, status: 200 })
    })

    const statusUpdates = captureStatusUpdates()

    await runMain()

    // Token refresh was called
    const tokenRefreshCalls = mockFetch.mock.calls.filter(
      ([u]: [string]) => typeof u === 'string' && u.includes('oauth2.googleapis.com/token'),
    )
    expect(tokenRefreshCalls.length).toBe(1)

    // Upload ultimately succeeded
    const liveUpdate = statusUpdates.find((u) => u.status === 'live')
    expect(liveUpdate).toBeDefined()
  })

  test('fails with reconnect message when refresh token is invalid', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    mockFetch.mockImplementation((url: string) => {
      // Token refresh fails
      if (typeof url === 'string' && url.includes('oauth2.googleapis.com/token')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'invalid_grant' }),
        })
      }

      // Init returns 401
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
          headers: { get: () => null },
        })
      }

      return Promise.resolve({ ok: true, status: 200 })
    })

    const statusUpdates = captureStatusUpdates()

    await runMain()

    const failedUpdate = statusUpdates.find((u) => u.status === 'failed')
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate!.errorMessage).toContain('reconnect')
  })

  test('updates connected_accounts.access_token after successful refresh', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    let initCallCount = 0
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('oauth2.googleapis.com/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'ya29.refreshed' }),
        })
      }
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        initCallCount++
        if (initCallCount === 1) {
          return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve(''), headers: { get: () => null } })
        }
        return Promise.resolve({
          ok: true, status: 200,
          headers: { get: (key: string) => key === 'Location' ? 'https://www.googleapis.com/upload/youtube/resume?upload_id=789' : null },
        })
      }
      if (typeof url === 'string' && url.includes('resume?upload_id=')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 'VID' }) })
      }
      if (typeof url === 'string' && url.includes('youtube/v3/videos?id=')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ items: [{ status: { uploadStatus: 'processed' } }] }),
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    await runMain()

    // The db.update for connectedAccounts with accessToken should have been called
    const setCallArgs = mockDbUpdateSet.mock.calls
    const tokenUpdate = setCallArgs.find(
      ([arg]: [Record<string, unknown>]) => arg && 'accessToken' in arg,
    )
    expect(tokenUpdate).toBeDefined()
  })

  test('updates connected_accounts.last_used_at on success', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupSuccessfulUploadFlow()

    await runMain()

    const setCallArgs = mockDbUpdateSet.mock.calls
    const lastUsedAtUpdate = setCallArgs.find(
      ([arg]: [Record<string, unknown>]) => arg && 'lastUsedAt' in arg,
    )
    expect(lastUsedAtUpdate).toBeDefined()
  })

  test('exits with code 0 on failure (prevents ECS retry)', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        return Promise.resolve({
          ok: false, status: 500,
          text: () => Promise.resolve('Error'),
          headers: { get: () => null },
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    await runMain()

    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  test('handles S3 GetObject error gracefully', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    mockS3Send.mockImplementation((cmd: { _type: string }) => {
      if (cmd._type === 'HeadObject') {
        return Promise.reject(new Error('NoSuchKey'))
      }
      return Promise.resolve({})
    })

    const statusUpdates = captureStatusUpdates()

    await runMain()

    const failedUpdate = statusUpdates.find((u) => u.status === 'failed')
    expect(failedUpdate).toBeDefined()
    expect(mockProcessExit).toHaveBeenCalledWith(0)
  })

  test('handles YouTube quota error (403) gracefully', async () => {
    process.env.UPLOAD_PAYLOAD = JSON.stringify(VALID_PAYLOAD)
    setupDefaultDbSelects()

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('uploadType=resumable')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve('quotaExceeded'),
          headers: { get: () => null },
        })
      }
      return Promise.resolve({ ok: true, status: 200 })
    })

    const statusUpdates = captureStatusUpdates()

    await runMain()

    const failedUpdate = statusUpdates.find((u) => u.status === 'failed')
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate!.errorMessage).toContain('quota')
  })
})
