import { describe, it, expect } from 'vitest'
import type { CutRegion, Transition, Boundary, KeptRange } from '../../../../../types/videoEditing'
import {
  computeKeptRanges,
  toOutputFrame,
  toSourceFrame,
  deriveSegmentBuffers,
  inferCutBounds,
  computeBoundaries,
  reconcileTransitions,
} from '../videoEditing'

// ---------------------------------------------------------------------------
// computeKeptRanges
// ---------------------------------------------------------------------------
describe('computeKeptRanges', () => {
  it('returns full range when no cuts', () => {
    const result = computeKeptRanges(100, [])
    expect(result).toEqual([{ startFrame: 0, endFrame: 100 }])
  })

  it('returns empty array when entire video is cut', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 0, endFrame: 100 }]
    expect(computeKeptRanges(100, cuts)).toEqual([])
  })

  it('handles a cut in the middle', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 30, endFrame: 60 }]
    const result = computeKeptRanges(100, cuts)
    expect(result).toEqual([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 60, endFrame: 100 },
    ])
  })

  it('handles a head trim (cut at start)', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 0, endFrame: 20 }]
    const result = computeKeptRanges(100, cuts)
    expect(result).toEqual([{ startFrame: 20, endFrame: 100 }])
  })

  it('handles a tail trim (cut at end)', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 80, endFrame: 100 }]
    const result = computeKeptRanges(100, cuts)
    expect(result).toEqual([{ startFrame: 0, endFrame: 80 }])
  })

  it('handles multiple non-overlapping cuts', () => {
    const cuts: CutRegion[] = [
      { id: 'c1', startFrame: 10, endFrame: 20 },
      { id: 'c2', startFrame: 40, endFrame: 50 },
    ]
    const result = computeKeptRanges(100, cuts)
    expect(result).toEqual([
      { startFrame: 0, endFrame: 10 },
      { startFrame: 20, endFrame: 40 },
      { startFrame: 50, endFrame: 100 },
    ])
  })

  it('auto-merges overlapping cuts', () => {
    const cuts: CutRegion[] = [
      { id: 'c1', startFrame: 10, endFrame: 40 },
      { id: 'c2', startFrame: 30, endFrame: 60 }, // overlaps c1
    ]
    const result = computeKeptRanges(100, cuts)
    expect(result).toEqual([
      { startFrame: 0, endFrame: 10 },
      { startFrame: 60, endFrame: 100 },
    ])
  })

  it('auto-merges adjacent cuts', () => {
    const cuts: CutRegion[] = [
      { id: 'c1', startFrame: 10, endFrame: 30 },
      { id: 'c2', startFrame: 30, endFrame: 50 }, // adjacent
    ]
    const result = computeKeptRanges(100, cuts)
    expect(result).toEqual([
      { startFrame: 0, endFrame: 10 },
      { startFrame: 50, endFrame: 100 },
    ])
  })

  it('filters zero-length kept ranges', () => {
    const cuts: CutRegion[] = [
      { id: 'c1', startFrame: 0, endFrame: 50 },
      { id: 'c2', startFrame: 50, endFrame: 100 },
    ]
    expect(computeKeptRanges(100, cuts)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// toOutputFrame / toSourceFrame
// ---------------------------------------------------------------------------
describe('toOutputFrame', () => {
  it('returns same frame when no cuts', () => {
    expect(toOutputFrame(50, [], [], 30)).toBe(50)
  })

  it('subtracts cut length before the source frame', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 10, endFrame: 30 }]
    // source frame 50: cut of length 20 is entirely before 50 → output 30
    expect(toOutputFrame(50, cuts, [], 30)).toBe(30)
  })

  it('source frame inside a cut maps to cut start output', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 10, endFrame: 30 }]
    // frame 20 is inside cut; output is equivalent to frame 10 in output
    expect(toOutputFrame(20, cuts, [], 30)).toBe(10)
  })

  it('handles multiple cuts', () => {
    const cuts: CutRegion[] = [
      { id: 'c1', startFrame: 0, endFrame: 10 },  // len 10
      { id: 'c2', startFrame: 20, endFrame: 30 }, // len 10
    ]
    // source frame 40: both cuts are before it → output 20
    expect(toOutputFrame(40, cuts, [], 30)).toBe(20)
  })
})

describe('toSourceFrame', () => {
  it('returns same frame when no cuts', () => {
    expect(toSourceFrame(50, [], [], 30)).toBe(50)
  })

  it('is inverse of toOutputFrame', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 10, endFrame: 30 }]
    const source = 50
    const output = toOutputFrame(source, cuts, [], 30)
    expect(toSourceFrame(output, cuts, [], 30)).toBe(source)
  })

  it('handles multiple cuts round-trip', () => {
    const cuts: CutRegion[] = [
      { id: 'c1', startFrame: 5, endFrame: 15 },
      { id: 'c2', startFrame: 40, endFrame: 60 },
    ]
    for (const src of [0, 4, 15, 20, 39, 60, 80]) {
      const out = toOutputFrame(src, cuts, [], 30)
      expect(toSourceFrame(out, cuts, [], 30)).toBe(src)
    }
  })
})

// ---------------------------------------------------------------------------
// deriveSegmentBuffers
// ---------------------------------------------------------------------------
describe('deriveSegmentBuffers', () => {
  it('returns defaults when styling is undefined', () => {
    const result = deriveSegmentBuffers(undefined, 30)
    // fade preRoll = DEFAULT_FADE_PRE_ROLL_SECONDS(3) + DEFAULT_FADE_DURATION_SECONDS(1) = 4
    // label preRoll = DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS(2) + DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS(0.5) = 2.5
    // max preRoll = 4 * 30 = 120
    // fade postRoll = DEFAULT_FADE_POST_ROLL_SECONDS(2) + DEFAULT_FADE_OUT_DURATION_SECONDS(1) = 3
    // label postRoll = DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS(2) + DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS(0.5) = 2.5
    // max postRoll = 3 * 30 = 90
    expect(result.preRollFrames).toBe(4 * 30)
    expect(result.postRollFrames).toBe(3 * 30)
  })

  it('uses fade styling values', () => {
    const result = deriveSegmentBuffers(
      { fade: { preRollSeconds: 5, durationSeconds: 1, postRollSeconds: 3 } },
      30
    )
    // preRoll from fade = 5+1=6 (preRoll + fadeIn), segmentLabel default = 2+0.5=2.5 → max = 6
    // postRoll from fade = 3+1=4 (postRoll + fadeOut), segmentLabel default = 2+0.5=2.5 → max = 4
    expect(result.preRollFrames).toBe(6 * 30)
    expect(result.postRollFrames).toBe(4 * 30)
  })

  it('uses segmentLabel styling values', () => {
    const result = deriveSegmentBuffers(
      {
        segmentLabel: {
          preRollSeconds: 4,
          fadeInDurationSeconds: 1,
          postRollSeconds: 3,
          fadeOutDurationSeconds: 0.5,
        },
      },
      60
    )
    // segmentLabel preRoll = 4+1=5, fade default = 3+1=4 → max=5
    // segmentLabel postRoll = 3+0.5=3.5, fade default = 2+1=3 → max=3.5
    expect(result.preRollFrames).toBe(5 * 60)
    expect(result.postRollFrames).toBe(3.5 * 60)
  })

  it('takes max across both component types', () => {
    const result = deriveSegmentBuffers(
      {
        fade: { preRollSeconds: 2, durationSeconds: 0.5 },
        segmentLabel: { preRollSeconds: 4, fadeInDurationSeconds: 0.5 },
      },
      30
    )
    // fade preRoll = 2+0.5=2.5; segmentLabel preRoll = 4+0.5=4.5 → max=4.5
    expect(result.preRollFrames).toBe(4.5 * 30)
  })
})

// ---------------------------------------------------------------------------
// inferCutBounds
// ---------------------------------------------------------------------------
describe('inferCutBounds', () => {
  const buffers = { preRollFrames: 30, postRollFrames: 20 }
  const totalFrames = 1000

  it('returns null if no segments provided', () => {
    expect(inferCutBounds(500, [], buffers, totalFrames)).toBeNull()
  })

  it('returns null when playhead is inside a segment', () => {
    // segment spans frame 100-200
    const spans = [{ startFrame: 100, endFrame: 200 }]
    expect(inferCutBounds(150, spans, buffers, totalFrames)).toBeNull()
  })

  it('returns null when playhead is inside segment pre-roll buffer', () => {
    const spans = [{ startFrame: 100, endFrame: 200 }]
    // preRoll=30 → buffer zone: 70-100
    expect(inferCutBounds(80, spans, buffers, totalFrames)).toBeNull()
  })

  it('returns null when playhead is inside segment post-roll buffer', () => {
    const spans = [{ startFrame: 100, endFrame: 200 }]
    // postRoll=20 → buffer zone: 200-220
    expect(inferCutBounds(210, spans, buffers, totalFrames)).toBeNull()
  })

  it('returns cut region before first segment', () => {
    const spans = [{ startFrame: 300, endFrame: 500 }]
    // dead space: 0 to (300 - 30) = 270
    const result = inferCutBounds(100, spans, buffers, totalFrames)
    expect(result).not.toBeNull()
    expect(result!.startFrame).toBe(0)
    expect(result!.endFrame).toBe(270)
  })

  it('returns cut region after last segment', () => {
    const spans = [{ startFrame: 100, endFrame: 300 }]
    // dead space: (300 + 20) = 320 to 1000
    const result = inferCutBounds(600, spans, buffers, totalFrames)
    expect(result).not.toBeNull()
    expect(result!.startFrame).toBe(320)
    expect(result!.endFrame).toBe(1000)
  })

  it('returns cut region between two segments', () => {
    const spans = [
      { startFrame: 100, endFrame: 200 },
      { startFrame: 400, endFrame: 600 },
    ]
    // dead space: (200 + 20) = 220 to (400 - 30) = 370
    const result = inferCutBounds(300, spans, buffers, totalFrames)
    expect(result).not.toBeNull()
    expect(result!.startFrame).toBe(220)
    expect(result!.endFrame).toBe(370)
  })

  it('returns null if playhead is in buffer zone between two segments', () => {
    const spans = [
      { startFrame: 100, endFrame: 200 },
      { startFrame: 400, endFrame: 600 },
    ]
    // postRoll of first segment: 200-220; playhead at 215 is in post-roll
    expect(inferCutBounds(215, spans, buffers, totalFrames)).toBeNull()
  })

  it('generates a unique id', () => {
    const spans = [{ startFrame: 300, endFrame: 500 }]
    const result = inferCutBounds(100, spans, buffers, totalFrames)
    expect(result).not.toBeNull()
    expect(typeof result!.id).toBe('string')
    expect(result!.id.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// computeBoundaries
// ---------------------------------------------------------------------------
describe('computeBoundaries', () => {
  const fps = 30

  it('always includes projectStart and projectEnd', () => {
    const result = computeBoundaries(300, [], [], fps)
    const kinds = result.map((b) => b.kind)
    expect(kinds).toContain('projectStart')
    expect(kinds).toContain('projectEnd')
  })

  it('projectStart is one-sided with correct allowedTypes', () => {
    const result = computeBoundaries(300, [], [], fps)
    const start = result.find((b) => b.kind === 'projectStart')!
    expect(start.oneSided).toBe(true)
    expect(start.frameInSource).toBe(0)
    expect(start.allowedTypes).toEqual(
      expect.arrayContaining(['fadeFromBlack', 'fadeThroughBlack'])
    )
    expect(start.allowedTypes).not.toContain('fadeToBlack')
  })

  it('projectEnd is one-sided with correct allowedTypes', () => {
    const result = computeBoundaries(300, [], [], fps)
    const end = result.find((b) => b.kind === 'projectEnd')!
    expect(end.oneSided).toBe(true)
    expect(end.frameInSource).toBe(300)
    expect(end.allowedTypes).toEqual(
      expect.arrayContaining(['fadeToBlack', 'fadeThroughBlack'])
    )
    expect(end.allowedTypes).not.toContain('fadeFromBlack')
  })

  it('adds boundary at file join inside a cut region', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 100, endFrame: 200 }]
    const fileJoins = [150]
    const result = computeBoundaries(300, cuts, fileJoins, fps)
    const cutBoundaries = result.filter((b) => b.kind === 'cut')
    expect(cutBoundaries).toHaveLength(1)
    expect(cutBoundaries[0].frameInSource).toBe(150)
  })

  it('does not add boundary at file join outside a cut region', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 100, endFrame: 200 }]
    const fileJoins = [250] // outside the cut
    const result = computeBoundaries(300, cuts, fileJoins, fps)
    const cutBoundaries = result.filter((b) => b.kind === 'cut')
    expect(cutBoundaries).toHaveLength(0)
  })

  it('file join boundaries have correct allowedTypes (all 4)', () => {
    const cuts: CutRegion[] = [{ id: 'c1', startFrame: 30, endFrame: 60 }]
    const result = computeBoundaries(300, cuts, [45], fps)
    const cutBoundary = result.find((b) => b.kind === 'cut')!
    expect(cutBoundary.allowedTypes).toEqual(
      expect.arrayContaining(['fadeFromBlack', 'fadeToBlack', 'fadeThroughBlack', 'crossfade'])
    )
    expect(cutBoundary.allowedTypes).toHaveLength(4)
  })

  it('no boundaries besides start/end when no cuts', () => {
    const result = computeBoundaries(300, [], [], fps)
    expect(result).toHaveLength(2)
  })

  it('boundaries have labels', () => {
    const result = computeBoundaries(300, [], [], fps)
    result.forEach((b) => {
      expect(typeof b.label).toBe('string')
      expect(b.label.length).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// reconcileTransitions
// ---------------------------------------------------------------------------
describe('reconcileTransitions', () => {
  it('keeps transitions whose boundaryId matches a boundary', () => {
    const boundaries: Boundary[] = [
      {
        id: 'start',
        kind: 'projectStart',
        frameInSource: 0,
        oneSided: true,
        label: 'Start',
        allowedTypes: ['fadeFromBlack', 'fadeThroughBlack'],
      },
    ]
    const transitions: Transition[] = [
      { id: 't1', boundaryId: 'start', type: 'fadeFromBlack', durationMs: 500 },
    ]
    const { kept, removed } = reconcileTransitions(transitions, boundaries)
    expect(kept).toHaveLength(1)
    expect(removed).toHaveLength(0)
  })

  it('removes transitions whose boundaryId has no matching boundary', () => {
    const boundaries: Boundary[] = []
    const transitions: Transition[] = [
      { id: 't1', boundaryId: 'nonexistent', type: 'fadeFromBlack', durationMs: 500 },
    ]
    const { kept, removed } = reconcileTransitions(transitions, boundaries)
    expect(kept).toHaveLength(0)
    expect(removed).toHaveLength(1)
    expect(removed[0].id).toBe('t1')
  })

  it('handles mixed kept and removed transitions', () => {
    const boundaries: Boundary[] = [
      {
        id: 'b1',
        kind: 'cut',
        frameInSource: 50,
        oneSided: false,
        label: '0:01.67',
        allowedTypes: ['fadeFromBlack', 'fadeToBlack', 'fadeThroughBlack', 'crossfade'],
      },
    ]
    const transitions: Transition[] = [
      { id: 't1', boundaryId: 'b1', type: 'crossfade', durationMs: 500 },
      { id: 't2', boundaryId: 'b2', type: 'fadeToBlack', durationMs: 500 },
    ]
    const { kept, removed } = reconcileTransitions(transitions, boundaries)
    expect(kept).toHaveLength(1)
    expect(kept[0].id).toBe('t1')
    expect(removed).toHaveLength(1)
    expect(removed[0].id).toBe('t2')
  })

  it('returns empty arrays when both inputs are empty', () => {
    const { kept, removed } = reconcileTransitions([], [])
    expect(kept).toEqual([])
    expect(removed).toEqual([])
  })
})
