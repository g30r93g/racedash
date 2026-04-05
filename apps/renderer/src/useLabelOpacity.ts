import { interpolate } from 'remotion'
import {
  DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS,
  DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS,
  type SegmentLabelStyling,
} from '@racedash/core'

/**
 * Computes segment-label fade-in/fade-out opacity.
 *
 * Returns 0 when the label is not visible, 1 when fully visible,
 * or an intermediate value during the fade window.
 */
export function useLabelOpacity(
  currentTime: number,
  labelStart: number | null,
  labelEnd: number | null,
  styling: SegmentLabelStyling | undefined,
): number {
  if (labelStart == null || labelEnd == null) return 0

  const fadeIn = styling?.fadeInDurationSeconds ?? DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS
  const fadeOut = styling?.fadeOutDurationSeconds ?? DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS

  const fadeInOpacity = interpolate(currentTime - labelStart, [0, fadeIn], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const fadeOutOpacity = interpolate(labelEnd - currentTime, [0, fadeOut], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return Math.min(fadeInOpacity, fadeOutOpacity)
}
