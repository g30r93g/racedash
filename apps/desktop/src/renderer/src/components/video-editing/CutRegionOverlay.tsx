import React from 'react'
import type { CutRegion } from '../../../../../types/videoEditing'
import { pct } from '@/components/video/timeline/types'

interface CutRegionOverlayProps {
  cuts: CutRegion[]
  duration: number
  fps: number
  onClick?: (cut: CutRegion) => void
}

export function CutRegionOverlay({ cuts, duration, fps, onClick }: CutRegionOverlayProps): React.ReactElement {
  return (
    <>
      {cuts.map((cut) => {
        const startSec = cut.startFrame / fps
        const widthSec = (cut.endFrame - cut.startFrame) / fps
        return (
          <div
            key={cut.id}
            className="absolute inset-y-0 cursor-pointer bg-red-500/15 hover:bg-red-500/25 transition-colors"
            style={{
              left: pct(startSec, duration),
              width: pct(widthSec, duration),
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 8px)',
            }}
            onClick={() => onClick?.(cut)}
          />
        )
      })}
    </>
  )
}
