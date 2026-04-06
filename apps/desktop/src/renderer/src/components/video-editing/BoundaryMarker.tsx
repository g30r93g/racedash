import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Boundary } from '../../../../../types/videoEditing'
import { pct } from '@/components/video/timeline/types'

interface BoundaryMarkerProps {
  boundary: Boundary
  duration: number
  fps: number
  hasTransition: boolean
}

export function BoundaryMarker({ boundary, duration, fps, hasTransition }: BoundaryMarkerProps): React.ReactElement {
  const { isOver, setNodeRef } = useDroppable({
    id: `boundary-${boundary.id}`,
    data: { type: 'boundary', boundary },
  })

  const posSeconds = boundary.frameInSource / fps

  return (
    <div
      ref={setNodeRef}
      className={`absolute top-0 bottom-0 z-10 flex w-5 -translate-x-1/2 items-center justify-center ${isOver ? 'bg-primary/20' : ''}`}
      style={{ left: pct(posSeconds, duration) }}
      data-boundary-id={boundary.id}
    >
      <div
        className={`h-3 w-1 rounded-full transition-all ${
          isOver
            ? 'scale-150 bg-primary'
            : hasTransition
              ? 'bg-primary'
              : 'bg-muted-foreground/40'
        }`}
      />
    </div>
  )
}
