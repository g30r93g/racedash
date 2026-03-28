import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('enc:', '')),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/mock/userData') },
}))

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))
vi.mock('node:fs', () => ({
  default: fsMock,
  ...fsMock,
}))

import { ipcMain } from 'electron'
import { registerTokenHandlers, getSessionToken } from '../auth'
import { loadSessionToken } from '../auth-helpers'

describe('loadSessionToken', () => {
  const handleHandlers = new Map<string, (...args: any[]) => any>()
  const onHandlers = new Map<string, (...args: any[]) => any>()

  beforeEach(() => {
    vi.clearAllMocks()
    handleHandlers.clear()
    onHandlers.clear()
    fsMock.existsSync.mockReturnValue(false)
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler: any) => {
      handleHandlers.set(channel, handler)
      return undefined as any
    })
    vi.mocked(ipcMain.on).mockImplementation((channel: string, handler: any) => {
      onHandlers.set(channel, handler)
      return undefined as any
    })
    registerTokenHandlers({ webContents: { send: vi.fn() } } as any)
    // Clear in-memory session token
    onHandlers.get('racedash:auth:token:clear')!()
  })

  it('returns null when no session token has been set', () => {
    expect(loadSessionToken()).toBeNull()
  })

  it('returns token from encrypted session file', async () => {
    await handleHandlers.get('racedash:auth:token:save:session')!({}, 'sk_test_123')
    expect(loadSessionToken()).toBe('sk_test_123')
  })

  it('returns null on after token is cleared', async () => {
    await handleHandlers.get('racedash:auth:token:save:session')!({}, 'sk_test_123')
    expect(loadSessionToken()).toBe('sk_test_123')

    onHandlers.get('racedash:auth:token:clear')!()
    expect(loadSessionToken()).toBeNull()
  })
})
