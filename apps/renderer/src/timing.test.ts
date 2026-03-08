import { describe, expect, it } from 'vitest'
import type { LapTimestamp } from '@racedash/core'
import { getLapAtTime, getLapElapsed } from './timing'

const timestamps: LapTimestamp[] = [
  { lap: { number: 1, lapTime: 68.588, cumulative: 68.588 }, ytSeconds: 135.0 },
  { lap: { number: 2, lapTime: 64.776, cumulative: 133.364 }, ytSeconds: 203.588 },
  { lap: { number: 3, lapTime: 65.218, cumulative: 198.582 }, ytSeconds: 268.364 },
]

describe('getLapAtTime', () => {
  it('returns first lap before race starts', () => {
    expect(getLapAtTime(timestamps, 100.0).lap.number).toBe(1)
  })
  it('returns lap 1 during lap 1', () => {
    expect(getLapAtTime(timestamps, 140.0).lap.number).toBe(1)
  })
  it('returns lap 2 once lap 2 has started', () => {
    expect(getLapAtTime(timestamps, 204.0).lap.number).toBe(2)
  })
  it('returns last lap after all laps complete', () => {
    expect(getLapAtTime(timestamps, 9999.0).lap.number).toBe(3)
  })
})

describe('getLapElapsed', () => {
  it('returns time elapsed within the current lap', () => {
    const ts = timestamps[1] // lap 2 starts at 203.588
    expect(getLapElapsed(ts, 210.0)).toBeCloseTo(6.412)
  })
})
