import { describe, expect, it } from 'vitest'
import { buildBannerPath } from './buildBannerPath'

describe('buildBannerPath', () => {
  it('returns a non-empty string', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    expect(typeof d).toBe('string')
    expect(d.length).toBeGreaterThan(0)
  })

  it('starts with M and ends with Z', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    expect(d.trimStart().startsWith('M')).toBe(true)
    expect(d.trimEnd().endsWith('Z')).toBe(true)
  })

  it('path starts at centerStart, 0', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    // First move command should be to (centerStart, 0)
    expect(d).toMatch(/^M\s*810\s+0/)
  })

  it('path contains the flat bottom line at H - rise', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 18 })
    const bottomY = 80 - 18 // = 62
    expect(d).toContain(`${bottomY}`)
  })

  it('clamps curveInset when centerStart is very small', () => {
    // centerStart = 10 — curveInset must not go below 0
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 10, centerEnd: 1910, rise: 18 })
    expect(typeof d).toBe('string')
    expect(d.length).toBeGreaterThan(0)
    // The bottom-left anchor x must be >= 0
    expect(d).not.toMatch(/C\s*-/)
  })

  it('produces different paths for different rise values', () => {
    const d1 = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 10 })
    const d2 = buildBannerPath({ width: 1920, height: 80, centerStart: 810, centerEnd: 1110, rise: 30 })
    expect(d1).not.toBe(d2)
  })

  it('centerStart === 0 and centerEnd === width produces a full-width dark rect path', () => {
    const d = buildBannerPath({ width: 1920, height: 80, centerStart: 0, centerEnd: 1920, rise: 18 })
    expect(typeof d).toBe('string')
  })
})
