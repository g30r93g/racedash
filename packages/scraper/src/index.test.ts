import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDrivers } from './index'

const sampleHtml = readFileSync(
  join(__dirname, '__fixtures__/laptimes_sample.html'),
  'utf8',
)

describe('parseDrivers', () => {
  it('returns two drivers', () => {
    expect(parseDrivers(sampleHtml)).toHaveLength(2)
  })

  it('parses driver name and kart number', () => {
    const drivers = parseDrivers(sampleHtml)
    expect(drivers[0].name).toBe('Reading C')
    expect(drivers[0].kart).toBe('51')
    expect(drivers[1].name).toBe('Surrey C')
  })

  it('parses 3 laps for Reading C with correct times', () => {
    const [reading] = parseDrivers(sampleHtml)
    expect(reading.laps).toHaveLength(3)
    expect(reading.laps[0]).toMatchObject({ number: 1, lapTime: 68.588, cumulative: 68.588 })
    expect(reading.laps[1]).toMatchObject({ number: 2, lapTime: 64.776, cumulative: 133.364 })
    expect(reading.laps[2]).toMatchObject({ number: 3, lapTime: 65.218, cumulative: 198.582 })
  })

  it('skips empty cells — Surrey C has only 2 laps', () => {
    const drivers = parseDrivers(sampleHtml)
    expect(drivers[1].laps).toHaveLength(2)
  })

  it('cumulative is a running sum', () => {
    const [, surrey] = parseDrivers(sampleHtml)
    expect(surrey.laps[0].cumulative).toBeCloseTo(69.812)
    expect(surrey.laps[1].cumulative).toBeCloseTo(69.812 + 66.729)
  })

  it('throws when table is missing', () => {
    expect(() => parseDrivers('<html></html>')).toThrow('Could not find laptimes table')
  })
})
