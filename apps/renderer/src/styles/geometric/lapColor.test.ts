import { describe, it, expect } from 'vitest'
import { computeLapColors } from './lapColor'
import type { Lap } from '@racedash/core'

const lap = (number: number, lapTime: number, cumulative: number): Lap =>
  ({ number, lapTime, cumulative })

describe('computeLapColors', () => {
  it('returns red when lap is slower than personal best', () => {
    const target = [lap(1, 60, 60), lap(2, 65, 125)]
    expect(computeLapColors(target, [target])).toEqual(['purple', 'red'])
  })

  it('returns purple when lap is a new PB and the session best', () => {
    const target = [lap(1, 60, 60), lap(2, 55, 115)]
    expect(computeLapColors(target, [target])).toEqual(['purple', 'purple'])
  })

  it('returns green when lap is a new PB but not the session best', () => {
    const target = [lap(1, 60, 60), lap(2, 55, 115)]
    const other = [lap(1, 50, 50)]  // other driver already did 50s before cumulative 115
    expect(computeLapColors(target, [target, other])).toEqual(['green', 'green'])
  })

  it('first lap is always a PB — purple if session best, green otherwise', () => {
    const target = [lap(1, 70, 70)]
    const other = [lap(1, 65, 65)]  // other driver faster at cumulative 65 < 70
    expect(computeLapColors(target, [target, other])).toEqual(['green'])
  })

  it('handles single driver, single lap', () => {
    const target = [lap(1, 60, 60)]
    expect(computeLapColors(target, [target])).toEqual(['purple'])
  })
})
