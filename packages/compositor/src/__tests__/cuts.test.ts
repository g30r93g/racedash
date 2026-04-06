import { describe, it, expect } from 'vitest'
import { computeKeptRanges, buildCutConcatArgs } from '../cuts'

describe('computeKeptRanges', () => {
  it('returns full range when no cuts', () => {
    expect(computeKeptRanges(1000, [])).toEqual([{ startFrame: 0, endFrame: 1000 }])
  })

  it('splits around a single cut', () => {
    expect(computeKeptRanges(1000, [{ id: 'c1', startFrame: 200, endFrame: 400 }])).toEqual([
      { startFrame: 0, endFrame: 200 },
      { startFrame: 400, endFrame: 1000 },
    ])
  })

  it('handles multiple cuts', () => {
    expect(computeKeptRanges(1000, [
      { id: 'c1', startFrame: 100, endFrame: 200 },
      { id: 'c2', startFrame: 500, endFrame: 700 },
    ])).toEqual([
      { startFrame: 0, endFrame: 100 },
      { startFrame: 200, endFrame: 500 },
      { startFrame: 700, endFrame: 1000 },
    ])
  })

  it('returns empty when entire video is cut', () => {
    expect(computeKeptRanges(1000, [{ id: 'c1', startFrame: 0, endFrame: 1000 }])).toEqual([])
  })
})

describe('buildCutConcatArgs', () => {
  it('returns no trim filter when no cuts', () => {
    const result = buildCutConcatArgs('/in.mp4', '/out.mp4', [], [], 60, 30)
    expect(result.trimFilterUsed).toBe(false)
  })

  it('generates trim+concat filter for cuts', () => {
    const result = buildCutConcatArgs(
      '/in.mp4', '/out.mp4',
      [{ id: 'c1', startFrame: 600, endFrame: 1200 }],
      [], 60, 30,
    )
    expect(result.trimFilterUsed).toBe(true)
    expect(result.args.join(' ')).toContain('trim')
    expect(result.args.join(' ')).toContain('concat')
    expect(result.args).toContain('/in.mp4')
    expect(result.args).toContain('/out.mp4')
  })

  it('handles head trim', () => {
    const result = buildCutConcatArgs(
      '/in.mp4', '/out.mp4',
      [{ id: 'c1', startFrame: 0, endFrame: 600 }],
      [], 60, 30,
    )
    expect(result.trimFilterUsed).toBe(true)
    // Only one kept range: [600, 1800]
    const filterArg = result.args[result.args.indexOf('-filter_complex') + 1]
    expect(filterArg).toContain('trim=start=10')
  })
})
