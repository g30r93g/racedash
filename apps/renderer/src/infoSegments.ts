import type { BannerInfoSegmentContent } from '@racedash/core'

interface ResolveInfoSegmentsArgs {
  showTimePanels: boolean
  leftSegment?: BannerInfoSegmentContent
  rightSegment?: BannerInfoSegmentContent
}

interface ResolvedInfoSegments {
  leftSegment: BannerInfoSegmentContent
  rightSegment: BannerInfoSegmentContent
}

export function resolveInfoSegments({
  showTimePanels,
  leftSegment,
  rightSegment,
}: ResolveInfoSegmentsArgs): ResolvedInfoSegments {
  if (!showTimePanels) {
    return { leftSegment: 'none', rightSegment: 'none' }
  }

  return {
    leftSegment: leftSegment ?? 'last-lap',
    rightSegment: rightSegment ?? 'best-lap',
  }
}
