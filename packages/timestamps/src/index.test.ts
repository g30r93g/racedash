import { describe, expect, it } from 'vitest'
import type { Lap } from '@racedash/core'
import {
  calculateTimestamps,
  formatChapters,
  formatLapTime,
  formatYtTimestamp,
  parseOffset,
} from './index'

// --- parseOffset ---

describe('parseOffset', () => {
  it('parses M:SS', () => expect(parseOffset('2:15')).toBeCloseTo(135.0))
  it('parses H:MM:SS', () => expect(parseOffset('0:02:15')).toBeCloseTo(135.0))
  it('parses decimal seconds', () => expect(parseOffset('1:23.5')).toBeCloseTo(83.5))
  it('parses zero', () => expect(parseOffset('0:00')).toBeCloseTo(0))
  it('throws on invalid', () => expect(() => parseOffset('not-a-time')).toThrow('Invalid offset'))
  it('throws on malformed segments', () => expect(() => parseOffset('abc:xyz')).toThrow('Invalid offset'))
})

// --- calculateTimestamps ---

describe('calculateTimestamps', () => {
  const laps: Lap[] = [
    { number: 1, lapTime: 68.588, cumulative: 68.588 },
    { number: 2, lapTime: 64.776, cumulative: 133.364 },
  ]

  it('timestamps mark the START of each lap', () => {
    const result = calculateTimestamps(laps, 135.0)
    expect(result[0].ytSeconds).toBeCloseTo(135.0)             // lap 1 starts at offset
    expect(result[1].ytSeconds).toBeCloseTo(68.588 + 135.0)   // lap 2 starts after lap 1
  })

  it('preserves lap reference', () => {
    const result = calculateTimestamps([laps[0]], 0)
    expect(result[0].lap).toBe(laps[0])
  })
})

// --- formatYtTimestamp ---

describe('formatYtTimestamp', () => {
  it('formats under one hour', () => expect(formatYtTimestamp(135)).toBe('2:15'))
  it('formats over one hour', () => expect(formatYtTimestamp(3661)).toBe('1:01:01'))
  it('truncates sub-seconds', () => expect(formatYtTimestamp(83.9)).toBe('1:23'))
})

// --- formatLapTime ---

describe('formatLapTime', () => {
  it('formats normal lap', () => expect(formatLapTime(68.588)).toBe('1:08.588'))
  it('formats sub-minute', () => expect(formatLapTime(45.1)).toBe('0:45.100'))
  it('formats exactly 1 min', () => expect(formatLapTime(60.0)).toBe('1:00.000'))
})

// --- formatChapters ---

describe('formatChapters', () => {
  it('returns empty string for no timestamps', () => expect(formatChapters([])).toBe(''))

  it('formats two laps with timestamp first', () => {
    const timestamps = [
      { lap: { number: 1, lapTime: 68.588, cumulative: 68.588 }, ytSeconds: 203.588 },
      { lap: { number: 2, lapTime: 64.776, cumulative: 133.364 }, ytSeconds: 268.364 },
    ]
    const lines = formatChapters(timestamps).split('\n')
    expect(lines[0]).toBe('3:23   Lap  1   1:08.588')
    expect(lines[1]).toBe('4:28   Lap  2   1:04.776')
  })

  it('right-aligns timestamps to consistent width', () => {
    const timestamps = [
      { lap: { number: 1, lapTime: 60, cumulative: 60 }, ytSeconds: 3540 },   // 59:00
      { lap: { number: 2, lapTime: 60, cumulative: 120 }, ytSeconds: 3600 },  // 1:00:00
    ]
    const lines = formatChapters(timestamps).split('\n')
    expect(lines[0].length).toBe(lines[1].length)
  })
})
