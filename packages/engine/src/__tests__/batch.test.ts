import { describe, it, expect } from 'vitest'
import { rebaseSegment, computeClipRange, resolveSourceFiles } from '../batch'
import type { SessionSegment } from '@racedash/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<SessionSegment> = {}): SessionSegment {
  return {
    mode: 'race',
    session: {
      driver: { kart: '42', name: 'G. Gorzynski' },
      laps: [
        { number: 1, lapTime: 60, cumulative: 60 },
        { number: 2, lapTime: 58, cumulative: 118 },
      ],
      timestamps: [
        { lap: { number: 1, lapTime: 60, cumulative: 60 }, ytSeconds: 100 },
        { lap: { number: 2, lapTime: 58, cumulative: 118 }, ytSeconds: 160 },
      ],
    },
    sessionAllLaps: [],
    leaderboardDrivers: [
      {
        kart: '7',
        name: 'Other Driver',
        timestamps: [
          { lap: { number: 1, lapTime: 61, cumulative: 61 }, ytSeconds: 101 },
          { lap: { number: 2, lapTime: 59, cumulative: 120 }, ytSeconds: 162 },
        ],
      },
    ],
    raceLapSnapshots: [
      {
        leaderLap: 1,
        videoTimestamp: 105,
        entries: [],
      },
      {
        leaderLap: 2,
        videoTimestamp: 165,
        entries: [],
      },
    ],
    positionOverrides: [
      { timestamp: 110, position: 3 },
      { timestamp: 170, position: 2 },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// rebaseSegment
// ---------------------------------------------------------------------------

describe('rebaseSegment', () => {
  const FPS = 30
  const CLIP_START = 95 // seconds into video where our clip starts

  it('rebases session.timestamps.ytSeconds by subtracting clip start', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.session.timestamps[0].ytSeconds).toBeCloseTo(100 - 95) // 5s
    expect(rebased.session.timestamps[1].ytSeconds).toBeCloseTo(160 - 95) // 65s
  })

  it('preserves the lap data on each session timestamp', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.session.timestamps[0].lap).toEqual(seg.session.timestamps[0].lap)
    expect(rebased.session.timestamps[1].lap).toEqual(seg.session.timestamps[1].lap)
  })

  it('does NOT rebase session.laps.cumulative', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.session.laps[0].cumulative).toBe(60)
    expect(rebased.session.laps[1].cumulative).toBe(118)
  })

  it('does NOT rebase session.laps at all', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.session.laps).toEqual(seg.session.laps)
  })

  it('rebases leaderboardDrivers timestamps.ytSeconds', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.leaderboardDrivers![0].timestamps[0].ytSeconds).toBeCloseTo(101 - 95)
    expect(rebased.leaderboardDrivers![0].timestamps[1].ytSeconds).toBeCloseTo(162 - 95)
  })

  it('preserves leaderboardDrivers non-timestamp fields', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.leaderboardDrivers![0].kart).toBe('7')
    expect(rebased.leaderboardDrivers![0].name).toBe('Other Driver')
  })

  it('rebases raceLapSnapshots.videoTimestamp', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.raceLapSnapshots![0].videoTimestamp).toBeCloseTo(105 - 95)
    expect(rebased.raceLapSnapshots![1].videoTimestamp).toBeCloseTo(165 - 95)
  })

  it('preserves raceLapSnapshots non-timestamp fields', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.raceLapSnapshots![0].leaderLap).toBe(1)
    expect(rebased.raceLapSnapshots![0].entries).toEqual([])
  })

  it('rebases positionOverrides.timestamp (in seconds)', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.positionOverrides![0].timestamp).toBeCloseTo(110 - 95)
    expect(rebased.positionOverrides![1].timestamp).toBeCloseTo(170 - 95)
  })

  it('preserves positionOverrides.position', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, CLIP_START, FPS)

    expect(rebased.positionOverrides![0].position).toBe(3)
    expect(rebased.positionOverrides![1].position).toBe(2)
  })

  it('snaps timestamps to nearest frame boundary (session)', () => {
    // 1/3 of a frame at 30fps = 0.011111s, round trip should snap
    const seg = makeSegment()
    // ytSeconds = 100.005 — at 30fps frame width = 1/30 ≈ 0.03333s
    // 100.005 - 95 = 5.005 → 5.005 * 30 = 150.15 → round = 150 → 150/30 = 5.0
    seg.session.timestamps[0] = {
      ...seg.session.timestamps[0],
      ytSeconds: 100.005,
    }
    const rebased = rebaseSegment(seg, 95, FPS)
    const frameWidth = 1 / FPS
    // Must be a multiple of frameWidth (within floating-point tolerance)
    const frames = Math.round(rebased.session.timestamps[0].ytSeconds * FPS)
    expect(rebased.session.timestamps[0].ytSeconds).toBeCloseTo(frames / FPS, 10)
  })

  it('snaps positionOverrides.timestamp to nearest frame', () => {
    const seg = makeSegment()
    // timestamp = 110.007 → 110.007 - 95 = 15.007 → 15.007 * 30 = 450.21 → 450 → 450/30 = 15.0
    seg.positionOverrides![0] = { timestamp: 110.007, position: 3 }
    const rebased = rebaseSegment(seg, 95, FPS)
    const frames = Math.round(rebased.positionOverrides![0].timestamp * FPS)
    expect(rebased.positionOverrides![0].timestamp).toBeCloseTo(frames / FPS, 10)
  })

  it('handles undefined leaderboardDrivers gracefully', () => {
    const seg = makeSegment({ leaderboardDrivers: undefined })
    const rebased = rebaseSegment(seg, CLIP_START, FPS)
    expect(rebased.leaderboardDrivers).toBeUndefined()
  })

  it('handles undefined raceLapSnapshots gracefully', () => {
    const seg = makeSegment({ raceLapSnapshots: undefined })
    const rebased = rebaseSegment(seg, CLIP_START, FPS)
    expect(rebased.raceLapSnapshots).toBeUndefined()
  })

  it('handles undefined positionOverrides gracefully', () => {
    const seg = makeSegment({ positionOverrides: undefined })
    const rebased = rebaseSegment(seg, CLIP_START, FPS)
    expect(rebased.positionOverrides).toBeUndefined()
  })

  it('preserves mode and sessionAllLaps unchanged', () => {
    const allLaps = [[{ number: 1, lapTime: 60, cumulative: 60 }]]
    const seg = makeSegment({ mode: 'qualifying', sessionAllLaps: allLaps })
    const rebased = rebaseSegment(seg, CLIP_START, FPS)
    expect(rebased.mode).toBe('qualifying')
    expect(rebased.sessionAllLaps).toBe(allLaps)
  })

  it('works with clip start = 0 (no-op offset)', () => {
    const seg = makeSegment()
    const rebased = rebaseSegment(seg, 0, FPS)
    expect(rebased.session.timestamps[0].ytSeconds).toBeCloseTo(100)
    expect(rebased.session.timestamps[1].ytSeconds).toBeCloseTo(160)
  })

  it('uses the provided fps for frame snapping (60fps)', () => {
    const FPS60 = 60
    const seg = makeSegment()
    // 100 - 95 = 5.0 — already frame-aligned at any fps
    const rebased = rebaseSegment(seg, 95, FPS60)
    expect(rebased.session.timestamps[0].ytSeconds).toBeCloseTo(5.0)
    // Check it actually snaps: 100.008 - 95 = 5.008 → 5.008*60 = 300.48 → 300 → 5.0
    seg.session.timestamps[0] = { ...seg.session.timestamps[0], ytSeconds: 100.008 }
    const rebased2 = rebaseSegment(seg, 95, FPS60)
    const frames = Math.round(rebased2.session.timestamps[0].ytSeconds * FPS60)
    expect(rebased2.session.timestamps[0].ytSeconds).toBeCloseTo(frames / FPS60, 10)
  })
})

// ---------------------------------------------------------------------------
// computeClipRange
// ---------------------------------------------------------------------------

describe('computeClipRange', () => {
  const FPS = 30
  const TOTAL = 300 // 300 seconds total video duration

  it('adds 5s pre-roll and 5s post-roll', () => {
    const result = computeClipRange(50, 100, FPS, TOTAL)
    // start = 50 - 5 = 45s → 45 * 30 = 1350 frames
    // end   = 100 + 5 = 105s → 105 * 30 = 3150 frames
    expect(result.startFrame).toBe(1350)
    expect(result.endFrame).toBe(3150)
  })

  it('returns startFrame as inclusive', () => {
    const result = computeClipRange(10, 20, FPS, TOTAL)
    expect(result.startFrame).toBe((10 - 5) * FPS) // 150
  })

  it('returns endFrame as exclusive', () => {
    const result = computeClipRange(10, 20, FPS, TOTAL)
    expect(result.endFrame).toBe((20 + 5) * FPS) // 750
  })

  it('clamps startFrame to 0 when pre-roll would go negative', () => {
    const result = computeClipRange(3, 50, FPS, TOTAL) // 3 - 5 = -2 → clamp to 0
    expect(result.startFrame).toBe(0)
  })

  it('clamps endFrame to total frames when post-roll would exceed duration', () => {
    const result = computeClipRange(250, 297, FPS, TOTAL) // 297 + 5 = 302 > 300 → clamp
    expect(result.endFrame).toBe(TOTAL * FPS) // 9000 frames
  })

  it('clamps both start and end when at extremes', () => {
    const result = computeClipRange(0, TOTAL, FPS, TOTAL)
    expect(result.startFrame).toBe(0)
    expect(result.endFrame).toBe(TOTAL * FPS)
  })

  it('works when start is exactly 5s in (just avoids negative)', () => {
    const result = computeClipRange(5, 10, FPS, TOTAL)
    expect(result.startFrame).toBe(0)
    expect(result.endFrame).toBe(15 * FPS)
  })

  it('rounds to nearest frame for fractional second values', () => {
    // 10.5 - 5 = 5.5 → round(5.5 * 30) = round(165) = 165
    const result = computeClipRange(10.5, 20.5, FPS, TOTAL)
    expect(result.startFrame).toBe(Math.round(5.5 * FPS))
    expect(result.endFrame).toBe(Math.round(25.5 * FPS))
  })

  it('works with 60fps', () => {
    const result = computeClipRange(10, 20, 60, TOTAL)
    expect(result.startFrame).toBe(5 * 60) // 300
    expect(result.endFrame).toBe(25 * 60) // 1500
  })
})

// ---------------------------------------------------------------------------
// resolveSourceFiles
// ---------------------------------------------------------------------------

describe('resolveSourceFiles', () => {
  const files = [
    { path: 'a.mp4', startFrame: 0, endFrame: 1000 },
    { path: 'b.mp4', startFrame: 1000, endFrame: 2000 },
    { path: 'c.mp4', startFrame: 2000, endFrame: 3000 },
    { path: 'd.mp4', startFrame: 3000, endFrame: 4000 },
  ]

  it('returns the single file that fully contains the required range', () => {
    const result = resolveSourceFiles(files, 100, 900)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('a.mp4')
  })

  it('returns multiple files when range spans a boundary', () => {
    const result = resolveSourceFiles(files, 900, 1100)
    expect(result).toHaveLength(2)
    expect(result.map((f) => f.path)).toEqual(['a.mp4', 'b.mp4'])
  })

  it('returns all files when range spans all of them', () => {
    const result = resolveSourceFiles(files, 0, 4000)
    expect(result).toHaveLength(4)
  })

  it('returns empty array when required range is before all files', () => {
    const result = resolveSourceFiles(files, -200, -10)
    expect(result).toHaveLength(0)
  })

  it('returns empty array when required range is after all files', () => {
    const result = resolveSourceFiles(files, 4000, 5000)
    expect(result).toHaveLength(0)
  })

  it('excludes files whose endFrame equals requiredStartFrame (exclusive boundary)', () => {
    // file a ends at 1000; required starts at 1000 → a should NOT be included
    const result = resolveSourceFiles(files, 1000, 1500)
    expect(result.map((f) => f.path)).toEqual(['b.mp4'])
  })

  it('excludes files whose startFrame equals requiredEndFrame (exclusive boundary)', () => {
    // file b starts at 1000; required ends at 1000 → b should NOT be included
    const result = resolveSourceFiles(files, 500, 1000)
    expect(result.map((f) => f.path)).toEqual(['a.mp4'])
  })

  it('handles empty file list', () => {
    const result = resolveSourceFiles([], 0, 1000)
    expect(result).toHaveLength(0)
  })

  it('returns a minimal set — only overlapping files', () => {
    const result = resolveSourceFiles(files, 1500, 2500)
    expect(result).toHaveLength(2)
    expect(result.map((f) => f.path)).toEqual(['b.mp4', 'c.mp4'])
  })

  it('handles a single file that spans the entire required range', () => {
    const bigFile = [{ path: 'big.mp4', startFrame: 0, endFrame: 10000 }]
    const result = resolveSourceFiles(bigFile, 1000, 9000)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('big.mp4')
  })

  it('handles required range exactly matching a file boundary', () => {
    const result = resolveSourceFiles(files, 1000, 2000)
    expect(result.map((f) => f.path)).toEqual(['b.mp4'])
  })
})
