import { describe, expect, it } from 'vitest'
import { buildExtractClipArgs } from '../clip'

describe('buildExtractClipArgs', () => {
  it('places -ss before -i for input-level seeking', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    const ssIdx = args.indexOf('-ss')
    const iIdx = args.indexOf('-i')
    expect(ssIdx).toBeGreaterThanOrEqual(0)
    expect(iIdx).toBeGreaterThan(ssIdx)
  })

  it('sets -ss to correct start time in seconds', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 5700, 12300, 60)
    const ssIdx = args.indexOf('-ss')
    expect(args[ssIdx + 1]).toBe('95') // 5700 / 60 = 95s
  })

  it('uses -t duration, not -to absolute', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 5700, 12300, 60)
    expect(args).toContain('-t')
    expect(args).not.toContain('-to')
    const tIdx = args.indexOf('-t')
    expect(args[tIdx + 1]).toBe('110') // (12300 - 5700) / 60 = 110s duration
  })

  it('uses -c copy for full stream copy', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    const cIdx = args.indexOf('-c')
    expect(cIdx).toBeGreaterThanOrEqual(0)
    expect(args[cIdx + 1]).toBe('copy')
  })

  it('does not include -copyts', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    expect(args).not.toContain('-copyts')
  })

  it('includes -y to overwrite output without prompt', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    expect(args).toContain('-y')
  })

  it('includes the output path', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    expect(args).toContain('/out.mp4')
  })

  it('includes the source path after -i', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    const iIdx = args.indexOf('-i')
    expect(args[iIdx + 1]).toBe('/in.mp4')
  })

  it('computes correct start time for non-zero start frame', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 120, 270, 30)
    const ssIdx = args.indexOf('-ss')
    expect(args[ssIdx + 1]).toBe('4') // 120 / 30 = 4s
    const tIdx = args.indexOf('-t')
    expect(args[tIdx + 1]).toBe('5') // (270 - 120) / 30 = 5s
  })

  it('handles fractional fps correctly', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 60, 29.97)
    const tIdx = args.indexOf('-t')
    const duration = parseFloat(args[tIdx + 1])
    expect(duration).toBeCloseTo(2.002, 2) // 60 / 29.97 ≈ 2.002s
  })
})
