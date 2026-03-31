import { describe, it, expect } from 'vitest'
import { smartSortVideoPaths } from '../videoFileOrder'

describe('smartSortVideoPaths', () => {
  it('sorts GoPro chapters by chapter number (GXccSSSS pattern)', () => {
    const input = [
      '/videos/GX030042.MP4',
      '/videos/GX010042.MP4',
      '/videos/GX020042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GX010042.MP4',
      '/videos/GX020042.MP4',
      '/videos/GX030042.MP4',
    ])
  })

  it('sorts GoPro Hero5-7 style (GPccSSSS pattern)', () => {
    const input = [
      '/videos/GP020015.MP4',
      '/videos/GP010015.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GP010015.MP4',
      '/videos/GP020015.MP4',
    ])
  })

  it('groups GoPro files by session ID before sorting chapters', () => {
    const input = [
      '/videos/GX020099.MP4',
      '/videos/GX010042.MP4',
      '/videos/GX010099.MP4',
      '/videos/GX020042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GX010042.MP4',
      '/videos/GX020042.MP4',
      '/videos/GX010099.MP4',
      '/videos/GX020099.MP4',
    ])
  })

  it('preserves original order for non-GoPro files', () => {
    const input = [
      '/videos/sunset.mp4',
      '/videos/afternoon.mp4',
      '/videos/morning.mp4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/sunset.mp4',
      '/videos/afternoon.mp4',
      '/videos/morning.mp4',
    ])
  })

  it('preserves original order for mixed known/unknown files', () => {
    const input = [
      '/videos/random.mp4',
      '/videos/GX020042.MP4',
      '/videos/GX010042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/random.mp4',
      '/videos/GX020042.MP4',
      '/videos/GX010042.MP4',
    ])
  })

  it('handles single file (no sorting needed)', () => {
    const input = ['/videos/GX010042.MP4']
    expect(smartSortVideoPaths(input)).toEqual(['/videos/GX010042.MP4'])
  })

  it('handles empty array', () => {
    expect(smartSortVideoPaths([])).toEqual([])
  })

  it('is case-insensitive for extensions', () => {
    const input = [
      '/videos/GX020042.mp4',
      '/videos/GX010042.MP4',
    ]
    expect(smartSortVideoPaths(input)).toEqual([
      '/videos/GX010042.MP4',
      '/videos/GX020042.mp4',
    ])
  })

  it('does not mutate the input array', () => {
    const input = ['/videos/GX020042.MP4', '/videos/GX010042.MP4']
    const original = [...input]
    smartSortVideoPaths(input)
    expect(input).toEqual(original)
  })
})
