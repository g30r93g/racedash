import { describe, expect, it } from 'vitest'
import { resolveInfoSegments } from './infoSegments'

describe('resolveInfoSegments', () => {
  it('uses default left and right segment content when time panels are shown', () => {
    expect(resolveInfoSegments({ showTimePanels: true })).toEqual({
      leftSegment: 'last-lap',
      rightSegment: 'best-lap',
    })
  })

  it('uses explicit left and right segment content when configured', () => {
    expect(
      resolveInfoSegments({
        showTimePanels: true,
        leftSegment: 'best-lap',
        rightSegment: 'none',
      }),
    ).toEqual({
      leftSegment: 'best-lap',
      rightSegment: 'none',
    })
  })

  it('disables both info segments outside practice and qualifying layouts', () => {
    expect(resolveInfoSegments({ showTimePanels: false })).toEqual({
      leftSegment: 'none',
      rightSegment: 'none',
    })
  })
})
