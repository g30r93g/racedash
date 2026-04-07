import { useCurrentFrame } from 'remotion'
import type { LapOverlayProps, OverlayProps } from '@racedash/core'

interface LapGate {
  isLapRender: boolean
  isActive: boolean
  targetLapNumber: number | null
}

export function useLapGate(props: OverlayProps | LapOverlayProps): LapGate {
  const frame = useCurrentFrame()

  if (!('targetLapNumber' in props)) {
    return { isLapRender: false, isActive: true, targetLapNumber: null }
  }

  const lapProps = props as LapOverlayProps
  const active = frame >= lapProps.targetLapStartFrame && frame < lapProps.targetLapEndFrame
  return {
    isLapRender: true,
    isActive: active,
    targetLapNumber: lapProps.targetLapNumber,
  }
}
