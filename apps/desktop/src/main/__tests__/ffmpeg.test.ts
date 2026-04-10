import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}))

import { existsSync } from 'node:fs'
import { getBundledToolPath, configureBundledFfmpegPath, resolveFfprobeCommand } from '../ffmpeg'

// Use platform-native separator for cross-platform test assertions
const RESOURCES = path.join('/', 'app', 'resources')
const RESOURCES_FFMPEG = path.join(RESOURCES, 'ffmpeg')

describe('getBundledToolPath', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when resourcesPath is not set', () => {
    const originalResources = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: '', configurable: true })
    expect(getBundledToolPath('ffmpeg')).toBeNull()
    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true })
  })

  it('returns path when bundled tool exists', () => {
    const originalResources = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true })
    vi.mocked(existsSync).mockReturnValue(true)

    const result = getBundledToolPath('ffmpeg')
    expect(result).toContain('ffmpeg')
    expect(result).toContain(RESOURCES)

    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true })
  })

  it('returns null when bundled tool does not exist', () => {
    const originalResources = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true })
    vi.mocked(existsSync).mockReturnValue(false)

    expect(getBundledToolPath('ffmpeg')).toBeNull()

    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true })
  })
})

describe('configureBundledFfmpegPath', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does nothing when no bundled ffmpeg', () => {
    const originalResources = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: '', configurable: true })
    const originalPath = process.env.PATH

    configureBundledFfmpegPath()

    expect(process.env.PATH).toBe(originalPath)
    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true })
  })

  it('prepends bundled dir to PATH', () => {
    const originalResources = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true })
    vi.mocked(existsSync).mockReturnValue(true)
    const originalPath = process.env.PATH

    configureBundledFfmpegPath()

    expect(process.env.PATH).toContain(RESOURCES_FFMPEG)

    // Restore
    process.env.PATH = originalPath
    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true })
  })
})

describe('resolveFfprobeCommand', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns bundled ffprobe when available', () => {
    const originalResources = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: RESOURCES, configurable: true })
    vi.mocked(existsSync).mockReturnValue(true)

    const result = resolveFfprobeCommand()
    expect(result).toContain('ffprobe')
    expect(result).toContain(RESOURCES)

    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true })
  })

  it('falls back to ffprobe on PATH', () => {
    const originalResources = process.resourcesPath
    Object.defineProperty(process, 'resourcesPath', { value: '', configurable: true })

    expect(resolveFfprobeCommand()).toBe('ffprobe')

    Object.defineProperty(process, 'resourcesPath', { value: originalResources, configurable: true })
  })
})
