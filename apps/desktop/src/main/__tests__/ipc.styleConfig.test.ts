import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn().mockReturnValue('/Users/testuser') },
  dialog: {},
  shell: {},
}))
vi.mock('@racedash/engine', () => ({
  joinVideos: vi.fn(),
  listDrivers: vi.fn(),
  generateTimestamps: vi.fn(),
  renderBatch: vi.fn(),
  parseFpsValue: vi.fn(),
  buildRaceLapSnapshots: vi.fn(),
  buildSessionSegments: vi.fn(),
  loadTimingConfig: vi.fn(),
  resolveTimingSegments: vi.fn(),
  resolveSegmentPositionOverrides: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}))

import { saveStyleToConfigHandler } from '../ipc'

describe('saveStyleToConfigHandler', () => {
  it('writes overlayType and styling, preserving existing fields', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'test-style-'))
    const configPath = join(tmp, 'config.json')
    writeFileSync(configPath, JSON.stringify({ segments: [{ source: 'manual' }], driver: 'GG' }))

    await saveStyleToConfigHandler(configPath, 'esports', { accentColor: '#ff0000' })

    const result = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(result.overlayType).toBe('esports')
    expect(result.styling).toEqual({ accentColor: '#ff0000' })
    expect(result.segments).toEqual([{ source: 'manual' }])
    expect(result.driver).toBe('GG')
  })

  it('overwrites existing overlayType and styling', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'test-style-'))
    const configPath = join(tmp, 'config.json')
    writeFileSync(configPath, JSON.stringify({ overlayType: 'banner', styling: { accentColor: '#000' } }))

    await saveStyleToConfigHandler(configPath, 'modern', { accentColor: '#fff' })

    const result = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(result.overlayType).toBe('modern')
    expect(result.styling).toEqual({ accentColor: '#fff' })
  })

  it('writes valid JSON (pretty-printed with 2-space indent)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'test-style-'))
    const configPath = join(tmp, 'config.json')
    writeFileSync(configPath, JSON.stringify({ segments: [] }))

    await saveStyleToConfigHandler(configPath, 'banner', {})

    const raw = readFileSync(configPath, 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(raw).toContain('\n') // pretty-printed
  })

  it('writes overlay component toggles to config.json and removes them when omitted', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'test-style-'))
    const configPath = join(tmp, 'config.json')
    writeFileSync(configPath, JSON.stringify({ overlayComponents: { lapTimer: 'off' } }))

    await saveStyleToConfigHandler(configPath, 'banner', {}, { overlayComponents: { lapTimer: 'on' } })

    let result = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(result.overlayComponents).toEqual({ lapTimer: 'on' })

    await saveStyleToConfigHandler(configPath, 'banner', {})

    result = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(result.overlayComponents).toBeUndefined()
  })
})
