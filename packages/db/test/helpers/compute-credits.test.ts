import { describe, it, expect } from 'vitest'
import { computeCredits } from '../../src/helpers/compute-credits'

describe('computeCredits', () => {
  it('returns 1 for standard 1080p/60fps, 1 min', () => {
    expect(computeCredits({ width: 1920, height: 1080, fps: 60, durationSec: 60 })).toBe(1)
  })

  it('returns 3 for standard 1080p/60fps, 3 min', () => {
    expect(computeCredits({ width: 1920, height: 1080, fps: 60, durationSec: 180 })).toBe(3)
  })

  it('returns 3 for 4K/60fps, 1 min', () => {
    expect(computeCredits({ width: 3840, height: 2160, fps: 60, durationSec: 60 })).toBe(3)
  })

  it('returns 15 for 4K/60fps, 5 min', () => {
    expect(computeCredits({ width: 3840, height: 2160, fps: 60, durationSec: 300 })).toBe(15)
  })

  it('returns 2 for 1080p/120fps, 1 min (ceil of 1.75)', () => {
    expect(computeCredits({ width: 1920, height: 1080, fps: 120, durationSec: 60 })).toBe(2)
  })

  it('returns 6 for 4K/120fps, 1 min (ceil of 5.25)', () => {
    expect(computeCredits({ width: 3840, height: 2160, fps: 120, durationSec: 60 })).toBe(6)
  })

  it('returns 14 for 4K/120fps, 2.5 min (ceil of 13.125)', () => {
    expect(computeCredits({ width: 3840, height: 2160, fps: 120, durationSec: 150 })).toBe(14)
  })

  it('returns 0 for zero duration', () => {
    expect(computeCredits({ width: 1920, height: 1080, fps: 60, durationSec: 0 })).toBe(0)
  })

  it('returns 1 for very short duration (1 sec)', () => {
    expect(computeCredits({ width: 1920, height: 1080, fps: 60, durationSec: 1 })).toBe(1)
  })

  it('returns 1 for sub-4K high res (2560x1440) — resFactor = 1.0', () => {
    expect(computeCredits({ width: 2560, height: 1440, fps: 60, durationSec: 60 })).toBe(1)
  })

  it('returns 3 for exactly 3840 width — resFactor = 3.0', () => {
    expect(computeCredits({ width: 3840, height: 1080, fps: 60, durationSec: 60 })).toBe(3)
  })

  it('returns 2 for exactly 120fps — fpsFactor = 1.75', () => {
    expect(computeCredits({ width: 1920, height: 1080, fps: 120, durationSec: 60 })).toBe(2)
  })

  it('returns 1 for just below 120fps (119) — fpsFactor = 1.0', () => {
    expect(computeCredits({ width: 1920, height: 1080, fps: 119, durationSec: 60 })).toBe(1)
  })
})
