import React from 'react'
import type { Boundary } from '../../../../../types/videoEditing'
import { pct } from '@/components/video/timeline/types'

interface BoundaryMarkerProps {
  boundary: Boundary
  duration: number
  fps: number
  hasTransition: boolean
}

export function BoundaryMarker({ boundary, duration, fps, hasTransition }: BoundaryMarkerProps): React.ReactElement {
  const posSeconds = boundary.frameInSource / fps

  return (
    <div
      className="absolute top-0 bottom-0 z-10 flex w-3 -translate-x-1/2 items-center justify-center"
      style={{ left: pct(posSeconds, duration) }}
      data-boundary-id={boundary.id}
    >
      <div
        className={`h-3 w-1 rounded-full transition-transform ${hasTransition ? 'bg-primary' : 'bg-muted-foreground/40'}`}
      />
    </div>
  )
}
