import { describe, it, expect } from 'vitest'
import { resolveFileAtTime, type FileEntry } from '../useMultiVideo'

const FILES: FileEntry[] = [
  { path: '/a.mp4', durationSeconds: 10, startSeconds: 0 },
  { path: '/b.mp4', durationSeconds: 20, startSeconds: 10 },
  { path: '/c.mp4', durationSeconds: 5, startSeconds: 30 },
]

describe('resolveFileAtTime', () => {
  it('returns the first file for t=0', () => {
    const r = resolveFileAtTime(FILES, 0)
    expect(r).toEqual({ fileIndex: 0, path: '/a.mp4', localTime: 0 })
  })

  it('returns the first file for a time within it', () => {
    const r = resolveFileAtTime(FILES, 5)
    expect(r).toEqual({ fileIndex: 0, path: '/a.mp4', localTime: 5 })
  })

  it('crosses to the second file at the boundary', () => {
    const r = resolveFileAtTime(FILES, 10)
    expect(r).toEqual({ fileIndex: 1, path: '/b.mp4', localTime: 0 })
  })

  it('returns the second file for a time within it', () => {
    const r = resolveFileAtTime(FILES, 15)
    expect(r).toEqual({ fileIndex: 1, path: '/b.mp4', localTime: 5 })
  })

  it('crosses to the third file', () => {
    const r = resolveFileAtTime(FILES, 32)
    expect(r).toEqual({ fileIndex: 2, path: '/c.mp4', localTime: 2 })
  })

  it('clamps to the last file at the end', () => {
    const r = resolveFileAtTime(FILES, 35)
    expect(r).toEqual({ fileIndex: 2, path: '/c.mp4', localTime: 5 })
  })

  it('clamps negative times to 0', () => {
    const r = resolveFileAtTime(FILES, -5)
    expect(r).toEqual({ fileIndex: 0, path: '/a.mp4', localTime: 0 })
  })

  it('handles a single file', () => {
    const single: FileEntry[] = [{ path: '/only.mp4', durationSeconds: 60, startSeconds: 0 }]
    const r = resolveFileAtTime(single, 30)
    expect(r).toEqual({ fileIndex: 0, path: '/only.mp4', localTime: 30 })
  })
})
