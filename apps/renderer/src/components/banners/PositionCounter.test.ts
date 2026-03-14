import { describe, expect, it } from 'vitest'
import { resolveDisplayedPosition } from './PositionCounter'

describe('resolveDisplayedPosition', () => {
  it('uses live position when no overrides are active', () => {
    expect(
      resolveDisplayedPosition({
        currentTime: 100,
        raceStart: 90,
        lastTimingEventTime: 90,
        computedPosition: 4,
        livePosition: 3,
      }),
    ).toBe(3)
  })

  it('keeps pre-race display unchanged even when an override exists', () => {
    expect(
      resolveDisplayedPosition({
        currentTime: 89,
        raceStart: 90,
        lastTimingEventTime: -Infinity,
        computedPosition: 7,
        livePosition: 6,
        positionOverrides: [{ timestamp: 85, position: 5 }],
      }),
    ).toBe(6)
  })

  it('uses live/computed position before the first override', () => {
    expect(
      resolveDisplayedPosition({
        currentTime: 99.9,
        raceStart: 90,
        lastTimingEventTime: 90,
        computedPosition: 4,
        livePosition: 3,
        positionOverrides: [{ timestamp: 100, position: 5 }],
      }),
    ).toBe(3)
  })

  it('activates the override at its exact timestamp', () => {
    expect(
      resolveDisplayedPosition({
        currentTime: 100,
        raceStart: 90,
        lastTimingEventTime: 90,
        computedPosition: 4,
        livePosition: 3,
        positionOverrides: [{ timestamp: 100, position: 5 }],
      }),
    ).toBe(5)
  })

  it('holds the latest override between entries', () => {
    expect(
      resolveDisplayedPosition({
        currentTime: 150,
        raceStart: 90,
        lastTimingEventTime: 90,
        computedPosition: 4,
        livePosition: 3,
        positionOverrides: [
          { timestamp: 100, position: 5 },
          { timestamp: 200, position: 4 },
        ],
      }),
    ).toBe(5)
  })

  it('returns to alpha timing after the next timing event', () => {
    expect(
      resolveDisplayedPosition({
        currentTime: 250,
        raceStart: 90,
        lastTimingEventTime: 240,
        computedPosition: 4,
        livePosition: 2,
        positionOverrides: [
          { timestamp: 100, position: 5 },
          { timestamp: 200, position: 4 },
        ],
      }),
    ).toBe(2)
  })

  it('ignores overrides from a previous lap window', () => {
    expect(
      resolveDisplayedPosition({
        currentTime: 180,
        raceStart: 90,
        lastTimingEventTime: 170,
        computedPosition: 6,
        livePosition: 5,
        positionOverrides: [{ timestamp: 150, position: 4 }],
      }),
    ).toBe(5)
  })
})
