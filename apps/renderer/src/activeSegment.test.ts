import { describe, it, expect } from 'vitest'
import type { SessionSegment } from '@racedash/core'
import { resolveActiveSegment } from './activeSegment'

// Helper: minimal SessionSegment with a given offset and optional single lap
function seg(offset: number, lapTime: number, label?: string): SessionSegment {
  const ts = { lap: { number: 1, lapTime, cumulative: lapTime }, ytSeconds: offset }
  return {
    mode: 'practice',
    session: { driver: { kart: '1', name: 'Test' }, laps: [ts.lap], timestamps: [ts] },
    sessionAllLaps: [[ts.lap]],
    label,
  }
}

// seg0: starts at t=100, lapTime=60  → ends at t=160
// seg1: starts at t=200, lapTime=50  → ends at t=250
const SEG0 = seg(100, 60, 'Practice Start')
const SEG1 = seg(200, 50, 'Qualifying Start')
const SEGMENTS = [SEG0, SEG1]

describe('resolveActiveSegment', () => {
  describe('active segment selection', () => {
    it('returns first segment before any offset', () => {
      const r = resolveActiveSegment(SEGMENTS, 50, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('returns first segment at its exact offset', () => {
      const r = resolveActiveSegment(SEGMENTS, 100, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('returns first segment during its active laps', () => {
      const r = resolveActiveSegment(SEGMENTS, 130, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('returns first segment in END state (past its last lap but before second offset)', () => {
      const r = resolveActiveSegment(SEGMENTS, 175, 5)
      expect(r.segment).toBe(SEG0)
    })

    it('switches to second segment at its exact offset', () => {
      const r = resolveActiveSegment(SEGMENTS, 200, 5)
      expect(r.segment).toBe(SEG1)
    })

    it('returns last segment after all laps complete', () => {
      const r = resolveActiveSegment(SEGMENTS, 9999, 5)
      expect(r.segment).toBe(SEG1)
    })
  })

  describe('isEnd', () => {
    it('is false during active laps of first segment', () => {
      expect(resolveActiveSegment(SEGMENTS, 130, 5).isEnd).toBe(false)
    })

    it('is true once past the last lap end of the active segment', () => {
      // SEG0 ends at t=160; t=161 is END for SEG0
      expect(resolveActiveSegment(SEGMENTS, 161, 5).isEnd).toBe(true)
    })

    it('is false immediately after switching to second segment', () => {
      expect(resolveActiveSegment(SEGMENTS, 205, 5).isEnd).toBe(false)
    })

    it('is true past the last lap of the final segment', () => {
      // SEG1 ends at t=250
      expect(resolveActiveSegment(SEGMENTS, 260, 5).isEnd).toBe(true)
    })
  })

  describe('label', () => {
    const styling5s = { preRollSeconds: 5, postRollSeconds: 5 }
    const styling10s = { preRollSeconds: 10, postRollSeconds: 10 }

    it('shows label for first segment within its window (before offset)', () => {
      // SEG0 offset=100, preRoll=5 → labelStart=max(95, 0)=95, labelEnd=105
      expect(resolveActiveSegment(SEGMENTS, 97, 5, styling5s).label).toBe('Practice Start')
    })

    it('shows label for first segment within its window (after offset)', () => {
      expect(resolveActiveSegment(SEGMENTS, 103, 5, styling5s).label).toBe('Practice Start')
    })

    it('returns null outside the label window of first segment', () => {
      expect(resolveActiveSegment(SEGMENTS, 110, 5, styling5s).label).toBeNull()
    })

    it('shows label for second segment within its window (before offset)', () => {
      // SEG0 ends at t=160, SEG1 offset=200, preRoll=5
      // labelStart = max(200-5, 160) = max(195,160) = 195
      expect(resolveActiveSegment(SEGMENTS, 197, 5, styling5s).label).toBe('Qualifying Start')
    })

    it('shows label for second segment within its window (after offset)', () => {
      expect(resolveActiveSegment(SEGMENTS, 203, 5, styling5s).label).toBe('Qualifying Start')
    })

    it('returns null in the gap before the second segment label window', () => {
      // gap is t=160..195; t=180 is in the gap
      expect(resolveActiveSegment(SEGMENTS, 180, 5, styling5s).label).toBeNull()
    })

    it('clamps pre-window to prevSegEnd when sessions are back-to-back', () => {
      // SEG0 ends at 160, SEG1 offset=162 → labelStart=max(157,160)=160
      const s1 = seg(100, 60, 'Practice Start')
      const s2 = seg(162, 50, 'Qualifying Start')
      // t=159: before prevEnd (160), so still outside label window
      expect(resolveActiveSegment([s1, s2], 159, 5, styling5s).label).toBeNull()
      // t=162: at offset, inside window
      expect(resolveActiveSegment([s1, s2], 163, 5, styling5s).label).toBe('Qualifying Start')
    })

    it('returns null when segment has no label', () => {
      const unlabelled = [seg(100, 60), seg(200, 50)]
      expect(resolveActiveSegment(unlabelled, 97, 5, styling5s).label).toBeNull()
    })

    it('respects custom window size', () => {
      // preRoll=10; SEG0 offset=100, labelStart=max(90,0)=90
      expect(resolveActiveSegment(SEGMENTS, 92, 10, styling10s).label).toBe('Practice Start')
      expect(resolveActiveSegment(SEGMENTS, 88, 10, styling10s).label).toBeNull()
    })
  })
})
