import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { computeCredits } from '../../src/helpers/compute-credits'

describe('computeCredits properties', () => {
  it('always returns a non-negative integer', () => {
    fc.assert(
      fc.property(
        fc.record({
          width: fc.integer({ min: 1, max: 7680 }),
          height: fc.integer({ min: 1, max: 4320 }),
          fps: fc.integer({ min: 1, max: 240 }),
          durationSec: fc.integer({ min: 0, max: 36000 }),
        }),
        (input) => {
          const result = computeCredits(input)
          expect(result).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(result)).toBe(true)
        },
      ),
    )
  })

  it('is monotonic in duration — increasing duration never decreases credits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7680 }),
        fc.integer({ min: 1, max: 4320 }),
        fc.integer({ min: 1, max: 240 }),
        fc.integer({ min: 0, max: 18000 }),
        fc.integer({ min: 1, max: 18000 }),
        (width, height, fps, dur1, durDelta) => {
          const dur2 = dur1 + durDelta
          const credits1 = computeCredits({ width, height, fps, durationSec: dur1 })
          const credits2 = computeCredits({ width, height, fps, durationSec: dur2 })
          expect(credits2).toBeGreaterThanOrEqual(credits1)
        },
      ),
    )
  })

  it('4K always costs >= same content at 1080p', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 240 }),
        fc.integer({ min: 1, max: 36000 }),
        (fps, durationSec) => {
          const cost1080p = computeCredits({ width: 1920, height: 1080, fps, durationSec })
          const cost4k = computeCredits({ width: 3840, height: 2160, fps, durationSec })
          expect(cost4k).toBeGreaterThanOrEqual(cost1080p)
        },
      ),
    )
  })

  it('120fps always costs >= same content at 60fps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7680 }),
        fc.integer({ min: 1, max: 4320 }),
        fc.integer({ min: 1, max: 36000 }),
        (width, height, durationSec) => {
          const cost60 = computeCredits({ width, height, fps: 60, durationSec })
          const cost120 = computeCredits({ width, height, fps: 120, durationSec })
          expect(cost120).toBeGreaterThanOrEqual(cost60)
        },
      ),
    )
  })

  it('zero duration always returns 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7680 }),
        fc.integer({ min: 1, max: 4320 }),
        fc.integer({ min: 1, max: 240 }),
        (width, height, fps) => {
          expect(computeCredits({ width, height, fps, durationSec: 0 })).toBe(0)
        },
      ),
    )
  })
})

// Database-dependent property tests are marked as .todo
// They require a test database with transaction rollback per run.
describe.todo('credit reservation conservation (DB-dependent)', () => {
  it.todo('for any sequence of reserve+consume, total rc_remaining + consumed = total rc_total')
  it.todo('for any sequence of reserve+release, total rc_remaining is fully restored (non-expired packs)')
  it.todo('rc_remaining is never negative after any operation sequence')
})
