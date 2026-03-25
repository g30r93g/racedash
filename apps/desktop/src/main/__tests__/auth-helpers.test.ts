import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    decryptString: vi.fn((b: Buffer) => b.toString().replace('enc:', '')),
  },
  app: { getPath: vi.fn().mockReturnValue('/mock/userData') },
}))

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))
vi.mock('node:fs', () => ({
  default: fsMock,
  ...fsMock,
}))

import { loadSessionToken } from '../auth-helpers'

describe('loadSessionToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when session file does not exist', () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(false)
    expect(loadSessionToken()).toBeNull()
  })

  it('returns token from encrypted session file', () => {
    const session = { token: 'sk_test_123', userId: 'user-1' }
    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readFileSync).mockReturnValue(Buffer.from(`enc:${JSON.stringify(session)}`))

    expect(loadSessionToken()).toBe('sk_test_123')
  })

  it('returns null on corrupted session file', () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readFileSync).mockImplementation(() => { throw new Error('corrupted') })

    expect(loadSessionToken()).toBeNull()
  })
})
