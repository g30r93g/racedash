import { describe, it, expect } from 'vitest'
import { smartSortVideoPaths } from '../videoFileOrder'

describe('smartSortVideoPaths', () => {
  // -----------------------------------------------------------------------
  // GoPro
  // -----------------------------------------------------------------------

  describe('GoPro', () => {
    it('sorts chapters by chapter number (GXccSSSS pattern)', () => {
      const input = ['/videos/GX030042.MP4', '/videos/GX010042.MP4', '/videos/GX020042.MP4']
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/GX010042.MP4',
        '/videos/GX020042.MP4',
        '/videos/GX030042.MP4',
      ])
    })

    it('sorts Hero5-7 style (GPccSSSS pattern)', () => {
      const input = ['/videos/GP020015.MP4', '/videos/GP010015.MP4']
      expect(smartSortVideoPaths(input)).toEqual(['/videos/GP010015.MP4', '/videos/GP020015.MP4'])
    })

    it('groups by session ID before sorting chapters', () => {
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

    it('is case-insensitive for extensions', () => {
      const input = ['/videos/GX020042.mp4', '/videos/GX010042.MP4']
      expect(smartSortVideoPaths(input)).toEqual(['/videos/GX010042.MP4', '/videos/GX020042.mp4'])
    })
  })

  // -----------------------------------------------------------------------
  // DJI (timestamp format)
  // -----------------------------------------------------------------------

  describe('DJI timestamp format', () => {
    it('sorts chapters of the same recording by sequence number', () => {
      const input = [
        '/videos/DJI_20230801143022_0003_V.MP4',
        '/videos/DJI_20230801143022_0001_V.MP4',
        '/videos/DJI_20230801143022_0002_V.MP4',
      ]
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/DJI_20230801143022_0001_V.MP4',
        '/videos/DJI_20230801143022_0002_V.MP4',
        '/videos/DJI_20230801143022_0003_V.MP4',
      ])
    })

    it('groups by timestamp then sorts by sequence', () => {
      const input = [
        '/videos/DJI_20230801150512_0001_V.MP4',
        '/videos/DJI_20230801143022_0002_V.MP4',
        '/videos/DJI_20230801143022_0001_V.MP4',
      ]
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/DJI_20230801143022_0001_V.MP4',
        '/videos/DJI_20230801143022_0002_V.MP4',
        '/videos/DJI_20230801150512_0001_V.MP4',
      ])
    })

    it('handles different type suffixes (D, V, etc.)', () => {
      const input = [
        '/videos/DJI_20230801143022_0002_D.MP4',
        '/videos/DJI_20230801143022_0001_D.MP4',
      ]
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/DJI_20230801143022_0001_D.MP4',
        '/videos/DJI_20230801143022_0002_D.MP4',
      ])
    })
  })

  // -----------------------------------------------------------------------
  // DJI (legacy format)
  // -----------------------------------------------------------------------

  describe('DJI legacy format', () => {
    it('sorts by sequence number', () => {
      const input = ['/videos/DJI_0003.MP4', '/videos/DJI_0001.MP4', '/videos/DJI_0002.MP4']
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/DJI_0001.MP4',
        '/videos/DJI_0002.MP4',
        '/videos/DJI_0003.MP4',
      ])
    })
  })

  // -----------------------------------------------------------------------
  // Insta360
  // -----------------------------------------------------------------------

  describe('Insta360', () => {
    it('sorts chapters of the same session by sequence number', () => {
      const input = [
        '/videos/VID_20240801_154541_00_014.mp4',
        '/videos/VID_20240801_154541_00_012.mp4',
        '/videos/VID_20240801_154541_00_013.mp4',
      ]
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/VID_20240801_154541_00_012.mp4',
        '/videos/VID_20240801_154541_00_013.mp4',
        '/videos/VID_20240801_154541_00_014.mp4',
      ])
    })

    it('groups by timestamp then sorts by sequence', () => {
      const input = [
        '/videos/VID_20240801_170000_00_015.mp4',
        '/videos/VID_20240801_154541_00_013.mp4',
        '/videos/VID_20240801_154541_00_012.mp4',
      ]
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/VID_20240801_154541_00_012.mp4',
        '/videos/VID_20240801_154541_00_013.mp4',
        '/videos/VID_20240801_170000_00_015.mp4',
      ])
    })

    it('sorts lens variants within the same sequence number', () => {
      const input = [
        '/videos/VID_20220212_070353_10_003.insv',
        '/videos/VID_20220212_070353_00_003.insv',
      ]
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/VID_20220212_070353_00_003.insv',
        '/videos/VID_20220212_070353_10_003.insv',
      ])
    })

    it('handles PRO_VID prefix', () => {
      const input = [
        '/videos/PRO_VID_20220212_080000_00_006.insv',
        '/videos/PRO_VID_20220212_080000_00_005.insv',
      ]
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/PRO_VID_20220212_080000_00_005.insv',
        '/videos/PRO_VID_20220212_080000_00_006.insv',
      ])
    })
  })

  // -----------------------------------------------------------------------
  // General behavior
  // -----------------------------------------------------------------------

  describe('general', () => {
    it('preserves original order for non-camera files', () => {
      const input = ['/videos/sunset.mp4', '/videos/afternoon.mp4', '/videos/morning.mp4']
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/sunset.mp4',
        '/videos/afternoon.mp4',
        '/videos/morning.mp4',
      ])
    })

    it('preserves original order for mixed camera types', () => {
      const input = ['/videos/GX010042.MP4', '/videos/DJI_0001.MP4']
      expect(smartSortVideoPaths(input)).toEqual(['/videos/GX010042.MP4', '/videos/DJI_0001.MP4'])
    })

    it('preserves original order for mixed known/unknown files', () => {
      const input = ['/videos/random.mp4', '/videos/GX020042.MP4', '/videos/GX010042.MP4']
      expect(smartSortVideoPaths(input)).toEqual([
        '/videos/random.mp4',
        '/videos/GX020042.MP4',
        '/videos/GX010042.MP4',
      ])
    })

    it('handles single file', () => {
      expect(smartSortVideoPaths(['/videos/GX010042.MP4'])).toEqual(['/videos/GX010042.MP4'])
    })

    it('handles empty array', () => {
      expect(smartSortVideoPaths([])).toEqual([])
    })

    it('does not mutate the input array', () => {
      const input = ['/videos/GX020042.MP4', '/videos/GX010042.MP4']
      const original = [...input]
      smartSortVideoPaths(input)
      expect(input).toEqual(original)
    })
  })
})
