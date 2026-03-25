import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString().replace('enc:', '')),
  },
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

import { cacheLicense, loadCachedLicense } from '../license-cache'
import { safeStorage } from 'electron'

describe('cacheLicense', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes encrypted license to disk', () => {
    const license = { tier: 'pro', status: 'active', expiresAt: '2027-01-01' }
    cacheLicense(license as any)

    expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(license))
    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('cloud-license.enc'),
      expect.any(Buffer),
    )
  })

  it('deletes cache when license is null and file exists', () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    cacheLicense(null)

    expect(fsMock.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('cloud-license.enc'))
  })

  it('does nothing when license is null and no cache file', () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(false)
    cacheLicense(null)

    expect(fsMock.unlinkSync).not.toHaveBeenCalled()
  })
})

describe('loadCachedLicense', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when cache file does not exist', () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(false)
    expect(loadCachedLicense()).toBeNull()
  })

  it('decrypts and returns cached license', () => {
    const license = { tier: 'pro', status: 'active' }
    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readFileSync).mockReturnValue(Buffer.from(`enc:${JSON.stringify(license)}`))

    const result = loadCachedLicense()
    expect(result).toEqual(license)
  })

  it('returns null and clears file on corrupted cache', () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(true)
    vi.mocked(fsMock.readFileSync).mockImplementation(() => { throw new Error('corrupted') })

    const result = loadCachedLicense()
    expect(result).toBeNull()
    expect(fsMock.unlinkSync).toHaveBeenCalled()
  })
})
