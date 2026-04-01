import { interpolate } from 'remotion'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_OUT_DURATION_SECONDS,
  DEFAULT_FADE_POST_ROLL_SECONDS,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  type FadeStyling,
} from '@racedash/core'

interface FadeResult {
  /** Combined fade-in/fade-out opacity (0–1). */
  opacity: number
  /** Video-time at which the overlay first becomes visible. */
  showFrom: number
  /** Whether the overlay should be completely hidden (before pre-roll or after fade-out). */
  hidden: boolean
}

/**
 * Computes overlay fade-in and fade-out opacity for the current video time.
 *
 * @param currentTime  Current playback position in video seconds.
 * @param raceStart    First timestamp of the active segment (video seconds).
 * @param segEnd       End of the active segment's last lap (video seconds).
 * @param isEnd        Whether currentTime is past segEnd.
 * @param fade         FadeStyling config (all fields optional, defaults applied).
 */
export function useFadeOpacity(
  currentTime: number,
  raceStart: number,
  segEnd: number,
  isEnd: boolean,
  fade: FadeStyling | undefined,
): FadeResult {
  const enabled = fade?.enabled ?? DEFAULT_FADE_ENABLED
  const preRoll = fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS
  const postRoll = fade?.postRollSeconds ?? DEFAULT_FADE_POST_ROLL_SECONDS
  const fadeInDuration = fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS
  const fadeOutDuration = fade?.fadeOutDurationSeconds ?? DEFAULT_FADE_OUT_DURATION_SECONDS
  const showFrom = raceStart - preRoll
  // Fade-out begins after post-roll hold period
  const fadeOutStart = segEnd + postRoll

  // Before pre-roll and not past segment end: completely hidden
  if (currentTime < showFrom && !isEnd) {
    return { opacity: 0, showFrom, hidden: true }
  }

  if (!enabled) {
    // After post-roll when past segment end: hidden
    if (isEnd && currentTime > fadeOutStart) {
      return { opacity: 0, showFrom, hidden: true }
    }
    return { opacity: 1, showFrom, hidden: false }
  }

  // Fade-in: ramp 0→1 over fadeInDuration from showFrom
  const fadeIn = interpolate(currentTime - showFrom, [0, fadeInDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  // Fade-out: ramp 1→0 over fadeOutDuration, starting after post-roll hold
  if (isEnd && currentTime >= fadeOutStart) {
    const fadeOut = interpolate(currentTime - fadeOutStart, [0, fadeOutDuration], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    if (fadeOut <= 0) {
      return { opacity: 0, showFrom, hidden: true }
    }
    return { opacity: Math.min(fadeIn, fadeOut), showFrom, hidden: false }
  }

  return { opacity: fadeIn, showFrom, hidden: false }
}
