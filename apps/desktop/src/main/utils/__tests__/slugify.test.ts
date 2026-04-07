import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildOutputPath, slugify } from '../slugify'

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('hello world')).toBe('hello-world')
  })

  it('lowercases the text', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('Race #1!')).toBe('race-1')
  })

  it('collapses multiple special chars into one hyphen', () => {
    expect(slugify('Race -- Day')).toBe('race-day')
  })

  it('strips leading and trailing hyphens', () => {
    expect(slugify('!hello!')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })

  it('handles alphanumeric only', () => {
    expect(slugify('Qualifying1')).toBe('qualifying1')
  })
})

describe('buildOutputPath', () => {
  const dir = '/Users/driver/Projects/MyRace'
  const ts = '143022'

  it('builds entire project path with .mp4 extension', () => {
    const result = buildOutputPath(dir, 'entireProject', { timestamp: ts })
    expect(result).toBe(path.join(dir, `output-${ts}.mp4`))
  })

  it('builds entire project overlay-only path with .mov extension', () => {
    const result = buildOutputPath(dir, 'entireProject', { timestamp: ts, overlayOnly: true })
    expect(result).toBe(path.join(dir, `output-overlay-${ts}.mov`))
  })

  it('builds segment path from single label', () => {
    const result = buildOutputPath(dir, 'segment', { labels: ['Qualifying'], timestamp: ts })
    expect(result).toBe(path.join(dir, `output-qualifying-${ts}.mp4`))
  })

  it('builds lap path with lap number', () => {
    const result = buildOutputPath(dir, 'lap', {
      labels: ['Race 1'],
      lapNumber: 3,
      timestamp: ts,
    })
    expect(result).toBe(path.join(dir, `output-race-1-lap3-${ts}.mp4`))
  })

  it('builds linked segment path from two labels', () => {
    const result = buildOutputPath(dir, 'linkedSegment', {
      labels: ['Qualifying', 'Race 1'],
      timestamp: ts,
    })
    expect(result).toBe(path.join(dir, `output-qualifying-race-1-${ts}.mp4`))
  })

  it('builds linked segment overlay-only path with .mov extension', () => {
    const result = buildOutputPath(dir, 'linkedSegment', {
      labels: ['Qualifying', 'Race 1'],
      timestamp: ts,
      overlayOnly: true,
    })
    expect(result).toBe(path.join(dir, `output-qualifying-race-1-overlay-${ts}.mov`))
  })

  it('falls back to "unknown" slug when no labels provided', () => {
    const result = buildOutputPath(dir, 'segment', { timestamp: ts })
    expect(result).toBe(path.join(dir, `output-unknown-${ts}.mp4`))
  })

  it('uses path.join for cross-platform path construction', () => {
    const result = buildOutputPath(dir, 'entireProject', { timestamp: ts })
    // path.join normalises separators on the current platform
    expect(result).toBe(path.join(dir, `output-${ts}.mp4`))
    expect(result).toContain(path.sep)
  })
})
