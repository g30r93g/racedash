import { useCurrentFrame } from 'remotion'
import type { LapOverlayProps, OverlayProps } from '@racedash/core'

export interface LapGate {
  isLapRender: boolean
  /** True only during the target lap's frame range (before end). */
  isActive: boolean
  /** True after the target lap has finished — timer should freeze, not reset. */
  isPastEnd: boolean
  targetLapNumber: number | null
}

export function useLapGate(props: OverlayProps | LapOverlayProps): LapGate {
  const frame = useCurrentFrame()

  if (!('targetLapNumber' in props)) {
    return { isLapRender: false, isActive: true, isPastEnd: false, targetLapNumber: null }
  }

  const lapProps = props as LapOverlayProps
  const active = frame >= lapProps.targetLapStartFrame && frame < lapProps.targetLapEndFrame
  const pastEnd = frame >= lapProps.targetLapEndFrame
  return {
    isLapRender: true,
    isActive: active,
    isPastEnd: pastEnd,
    targetLapNumber: lapProps.targetLapNumber,
  }
}
