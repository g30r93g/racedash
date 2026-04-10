import { describe, it, expect } from 'vitest'
import { computeKeptRanges, buildCutConcatArgs, type ResolvedTransition } from '../cuts'

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
  it('returns no trim filter when no cuts and no transitions', () => {
    const result = buildCutConcatArgs('/in.mp4', '/out.mp4', [], [], 60, 30)
    expect(result.trimFilterUsed).toBe(false)
  })

  it('generates trim+concat filter for cuts without transitions', () => {
    const result = buildCutConcatArgs(
      '/in.mp4', '/out.mp4',
      [{ id: 'c1', startFrame: 600, endFrame: 1200 }],
      [], 60, 30,
    )
    expect(result.trimFilterUsed).toBe(true)
    expect(result.args.join(' ')).toContain('trim')
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
    const filterArg = result.args[result.args.indexOf('-filter_complex') + 1]
    expect(filterArg).toContain('trim=start=10')
  })

  it('applies crossfade at seam between kept ranges', () => {
    const transitions: ResolvedTransition[] = [
      { seam: 0, type: 'crossfade', durationMs: 500 },
    ]
    const result = buildCutConcatArgs(
      '/in.mp4', '/out.mp4',
      [{ id: 'c1', startFrame: 600, endFrame: 1200 }],
      transitions, 60, 30,
    )
    expect(result.trimFilterUsed).toBe(true)
    const filterArg = result.args[result.args.indexOf('-filter_complex') + 1]
    expect(filterArg).toContain('xfade')
    expect(filterArg).toContain('acrossfade')
  })

  it('applies fade-from-black at project start', () => {
    const transitions: ResolvedTransition[] = [
      { seam: 'start', type: 'fadeFromBlack', durationMs: 1000 },
    ]
    const result = buildCutConcatArgs(
      '/in.mp4', '/out.mp4',
      [{ id: 'c1', startFrame: 600, endFrame: 1200 }],
      transitions, 60, 30,
    )
    const filterArg = result.args[result.args.indexOf('-filter_complex') + 1]
    expect(filterArg).toContain('fade=t=in:st=0:d=1')
    expect(filterArg).toContain('afade=t=in:st=0:d=1')
  })

  it('applies fade-to-black at project end', () => {
    const transitions: ResolvedTransition[] = [
      { seam: 'end', type: 'fadeToBlack', durationMs: 1000 },
    ]
    const result = buildCutConcatArgs(
      '/in.mp4', '/out.mp4',
      [{ id: 'c1', startFrame: 600, endFrame: 1200 }],
      transitions, 60, 30,
    )
    const filterArg = result.args[result.args.indexOf('-filter_complex') + 1]
    expect(filterArg).toContain('fade=t=out')
    expect(filterArg).toContain('afade=t=out')
  })

  it('applies fade-through-black at seam', () => {
    const transitions: ResolvedTransition[] = [
      { seam: 0, type: 'fadeThroughBlack', durationMs: 1000 },
    ]
    const result = buildCutConcatArgs(
      '/in.mp4', '/out.mp4',
      [{ id: 'c1', startFrame: 600, endFrame: 1200 }],
      transitions, 60, 30,
    )
    const filterArg = result.args[result.args.indexOf('-filter_complex') + 1]
    // Fade out + fade in
    expect(filterArg).toContain('fade=t=out')
    expect(filterArg).toContain('fade=t=in')
  })
})
