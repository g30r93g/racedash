import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDrivers, parseGrid, parseReplayLapData } from './index'

const replayHtml = readFileSync(
  join(__dirname, '__fixtures__/replay_sample.html'),
  'utf-8',
)

const sampleHtml = readFileSync(
  join(__dirname, '__fixtures__/laptimes_sample.html'),
  'utf8',
)

const gridHtml = readFileSync(
  join(__dirname, '__fixtures__/grid_sample.html'),
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

describe('parseGrid', () => {
  it('returns three entries', () => {
    expect(parseGrid(gridHtml)).toHaveLength(3)
  })

  it('parses position, kart, and name', () => {
    const grid = parseGrid(gridHtml)
    expect(grid[0]).toMatchObject({ position: 1, kart: '51', name: 'Reading C' })
    expect(grid[1]).toMatchObject({ position: 2, kart: '81', name: 'Surrey C' })
    expect(grid[2]).toMatchObject({ position: 3, kart: '27', name: 'Coventry C' })
  })

  it('handles penalty notes in qualification column', () => {
    const grid = parseGrid(gridHtml)
    // Coventry C has "(-2 places)" in qualification — position should still be 3
    expect(grid[2].position).toBe(3)
  })

  it('throws when grid table is missing', () => {
    expect(() => parseGrid('<html></html>')).toThrow('Could not find grid table')
  })

  it('skips non-time cells like DNF — driver laps contain no NaN and DNF lap is excluded', () => {
    const html = `
      <table class="at-lap-chart-legend-table">
        <tbody>
          <tr>
            <td>
              <div class="at-lap-chart-legend-table-competitor">
                <span>99</span>
                <span>Test Driver</span>
              </div>
            </td>
            <td class="at-lap-chart-legend-table-laptime"><div>1:08.588</div></td>
            <td class="at-lap-chart-legend-table-laptime"><div>DNF</div></td>
            <td class="at-lap-chart-legend-table-laptime"><div>1:05.218</div></td>
          </tr>
        </tbody>
      </table>`
    const drivers = parseDrivers(html)
    expect(drivers[0].laps).toHaveLength(2)
    expect(drivers[0].laps.every(l => !isNaN(l.lapTime))).toBe(true)
    expect(drivers[0].laps.every(l => !isNaN(l.cumulative))).toBe(true)
  })

  it('parses sub-minute lap times in SS.mmm format', () => {
    const html = `
      <table class="at-lap-chart-legend-table">
        <tbody>
          <tr>
            <td>
              <div class="at-lap-chart-legend-table-competitor">
                <span>58</span>
                <span>Surrey A</span>
              </div>
            </td>
            <td class="at-lap-chart-legend-table-laptime"><div>57.449</div></td>
            <td class="at-lap-chart-legend-table-laptime"><div>53.377</div></td>
            <td class="at-lap-chart-legend-table-laptime"><div>53.265</div></td>
          </tr>
        </tbody>
      </table>`
    const drivers = parseDrivers(html)
    expect(drivers[0].laps).toHaveLength(3)
    expect(drivers[0].laps[0]).toMatchObject({ number: 1, lapTime: 57.449, cumulative: 57.449 })
    expect(drivers[0].laps[1]).toMatchObject({ number: 2, lapTime: 53.377, cumulative: 110.826 })
    expect(drivers[0].laps[2]).toMatchObject({ number: 3, lapTime: 53.265, cumulative: 164.091 })
  })

  it('parses mixed M:SS.mmm and SS.mmm lap times', () => {
    const html = `
      <table class="at-lap-chart-legend-table">
        <tbody>
          <tr>
            <td>
              <div class="at-lap-chart-legend-table-competitor">
                <span>58</span>
                <span>Surrey A</span>
              </div>
            </td>
            <td class="at-lap-chart-legend-table-laptime"><div>57.449</div></td>
            <td class="at-lap-chart-legend-table-laptime"><div>1:05.608</div></td>
            <td class="at-lap-chart-legend-table-laptime"><div>53.377</div></td>
          </tr>
        </tbody>
      </table>`
    const drivers = parseDrivers(html)
    expect(drivers[0].laps).toHaveLength(3)
    expect(drivers[0].laps[0]).toMatchObject({ number: 1, lapTime: 57.449 })
    expect(drivers[0].laps[1]).toMatchObject({ number: 2, lapTime: 65.608 })
    expect(drivers[0].laps[2]).toMatchObject({ number: 3, lapTime: 53.377 })
  })
})

describe('parseReplayLapData', () => {
  it('returns correct number of snapshots', () => {
    const result = parseReplayLapData(replayHtml)
    expect(result).toHaveLength(2)
  })

  it('preserves snapshot 0 verbatim — 2 entries with lapsCompleted=0', () => {
    const result = parseReplayLapData(replayHtml)
    const snapshot0 = result[0]
    expect(snapshot0).toHaveLength(2)
    expect(snapshot0[0].lapsCompleted).toBe(0)
    expect(snapshot0[1].lapsCompleted).toBe(0)
  })

  it('maps all fields correctly in snapshot 1 for P1 driver', () => {
    const result = parseReplayLapData(replayHtml)
    const p1 = result[1][0]
    expect(p1.driverId).toBe(101)
    expect(p1.position).toBe(1)
    expect(p1.kart).toBe('71')
    expect(p1.name).toBe('Alice Smith')
    expect(p1.lapsCompleted).toBe(1)
    expect(p1.totalSeconds).toBeCloseTo(69.707)
    expect(p1.gapToLeader).toBe('0.000')
    expect(p1.intervalToAhead).toBe('')
  })

  it('maps P2 fields correctly in snapshot 1', () => {
    const result = parseReplayLapData(replayHtml)
    const snap1 = result[1]
    const p2 = snap1.find(e => e.position === 2)!
    expect(p2.intervalToAhead).toBe('0.099')
    expect(p2.gapToLeader).toBe('0.099')
  })

  it('maps P3 (lapped driver) fields correctly in snapshot 1', () => {
    const result = parseReplayLapData(replayHtml)
    const snap1 = result[1]
    const p3 = snap1.find(e => e.position === 3)!
    expect(p3.gapToLeader).toBe('1 L')
    expect(p3.intervalToAhead).toBe('5.200')
    expect(p3.lapsCompleted).toBe(0)
  })

  it('totalSeconds is null for empty string time in snapshot 0', () => {
    const result = parseReplayLapData(replayHtml)
    const snapshot0 = result[0]
    expect(snapshot0[0].totalSeconds).toBeNull()
    expect(snapshot0[1].totalSeconds).toBeNull()
  })

  it('totalSeconds is null for time string without colon', () => {
    const html = `<html><body><script type="application/json" id="lapData">{"laps":[[{"C":201,"D":[["",""],["1",""],["55",""],["No Colon",""],["1",""],["139707",""],["",""],["",""],["0.000",""],["",""]]}]]}</script></body></html>`
    const result = parseReplayLapData(html)
    expect(result[0][0].totalSeconds).toBeNull()
  })

  it('returns [] for empty laps array', () => {
    const html = `<html><body><script type="application/json" id="lapData">{"laps":[]}</script></body></html>`
    const result = parseReplayLapData(html)
    expect(result).toEqual([])
  })

  it('throws if lapData script tag is absent', () => {
    expect(() => parseReplayLapData('<html><body></body></html>')).toThrow('lapData')
  })

  it('throws if JSON has no laps array', () => {
    const html = `<html><body><script type="application/json" id="lapData">{"other":true}</script></body></html>`
    expect(() => parseReplayLapData(html)).toThrow('laps')
  })
})
