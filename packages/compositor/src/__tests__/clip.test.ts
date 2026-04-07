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

  it('includes -copyts to preserve source PTS', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    expect(args).toContain('-copyts')
  })

  it('copies video stream with -c:v copy', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    const cvIdx = args.indexOf('-c:v')
    expect(cvIdx).toBeGreaterThanOrEqual(0)
    expect(args[cvIdx + 1]).toBe('copy')
  })

  it('re-encodes audio with aac codec', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    const caIdx = args.indexOf('-c:a')
    expect(caIdx).toBeGreaterThanOrEqual(0)
    expect(args[caIdx + 1]).toBe('aac')
  })

  it('applies audio fade-in filter', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    const afIdx = args.indexOf('-af')
    expect(afIdx).toBeGreaterThanOrEqual(0)
    expect(args[afIdx + 1]).toBe('afade=t=in:d=0.1')
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
    // 120 frames at 30 fps = 4 seconds
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 120, 270, 30)
    const ssIdx = args.indexOf('-ss')
    expect(args[ssIdx + 1]).toBe('4') // 120 / 30 = 4s
    const tIdx = args.indexOf('-t')
    expect(args[tIdx + 1]).toBe('5') // (270 - 120) / 30 = 5s
  })

  it('handles fractional fps correctly', () => {
    // 1001 frames at 29.97 fps ≈ 33.4s start, duration = 1 frame ≈ 0.0334s
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 60, 29.97)
    const tIdx = args.indexOf('-t')
    const duration = parseFloat(args[tIdx + 1])
    expect(duration).toBeCloseTo(2.002, 2) // 60 / 29.97 ≈ 2.002s
  })

  it('does not use generic -c copy (must use -c:v and -c:a separately)', () => {
    const args = buildExtractClipArgs('/in.mp4', '/out.mp4', 0, 3600, 60)
    // Find any '-c' that is immediately followed by 'copy' (generic stream copy)
    // This would be args where args[i] === '-c' and args[i+1] === 'copy'
    const hasGenericCopy = args.some((arg, i) => arg === '-c' && args[i + 1] === 'copy')
    expect(hasGenericCopy).toBe(false)
  })
})
