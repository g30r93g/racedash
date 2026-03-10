import { describe, expect, it } from 'vitest'
import type { Lap } from '@racedash/core'
import { getPosition } from './position'

const lap = (number: number, lapTime: number, cumulative: number): Lap => ({
  number, lapTime, cumulative,
})

const currentLaps: Lap[] = [
  lap(1, 68.0, 68.0),
  lap(2, 65.0, 133.0),
  lap(3, 63.0, 196.0),
]

const fasterDriver: Lap[] = [
  lap(1, 65.0, 65.0),
  lap(2, 64.0, 129.0),
  lap(3, 63.0, 192.0),
]

const slowerDriver: Lap[] = [
  lap(1, 70.0, 70.0),
  lap(2, 68.0, 138.0),
  lap(3, 67.0, 205.0),
]

const shortDriver: Lap[] = [
  lap(1, 66.0, 66.0),
  lap(2, 64.5, 130.5),
]

describe('getPosition — race mode', () => {
  const allLaps = [currentLaps, fasterDriver, slowerDriver]

  it('P2 at lap 1 (faster driver completed lap 1)', () => {
    expect(getPosition('race', 1, currentLaps, allLaps)).toBe(2)
  })

  it('P2 at lap 3 (faster driver is always ahead)', () => {
    expect(getPosition('race', 3, currentLaps, allLaps)).toBe(2)
  })

  it('P1 when current driver is fastest', () => {
    const allWithSlower = [currentLaps, slowerDriver]
    expect(getPosition('race', 1, currentLaps, allWithSlower)).toBe(1)
  })

  it('drivers without enough laps rank behind current driver', () => {
    const allWithShort = [currentLaps, fasterDriver, slowerDriver, shortDriver]
    expect(getPosition('race', 3, currentLaps, allWithShort)).toBe(2)
  })
})

describe('getPosition — qualifying/practice mode', () => {
  it('P2 when another driver has faster best through lap 2', () => {
    const allLaps = [currentLaps, fasterDriver, slowerDriver]
    expect(getPosition('qualifying', 2, currentLaps, allLaps)).toBe(2)
  })

  it('P1 when current driver has overall fastest best at lap 1', () => {
    const allLaps = [currentLaps, slowerDriver]
    expect(getPosition('practice', 1, currentLaps, allLaps)).toBe(1)
  })

  it('drivers with no laps through N are excluded', () => {
    const allLaps = [currentLaps, fasterDriver, slowerDriver, shortDriver]
    expect(getPosition('qualifying', 3, currentLaps, allLaps)).toBe(2)
  })
})
