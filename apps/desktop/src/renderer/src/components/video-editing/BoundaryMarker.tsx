import React, { useState } from 'react'
import { Shuffle } from 'lucide-react'
import type { Boundary, Transition, TransitionType } from '../../../../../types/videoEditing'
import { TransitionPopover } from './TransitionPopover'
import { pct } from '@/components/video/timeline/types'

interface BoundaryMarkerProps {
  boundary: Boundary
  duration: number
  fps: number
  transition?: Transition
  onAddTransition?: (boundaryId: string, type: TransitionType) => void
  onUpdateTransition?: (updated: Transition) => void
  onDeleteTransition?: (id: string) => void
}

export function BoundaryMarker({
  boundary,
  duration,
  fps,
  transition,
  onAddTransition,
  onUpdateTransition,
  onDeleteTransition,
}: BoundaryMarkerProps): React.ReactElement {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const posSeconds = boundary.frameInSource / fps

  const handleClick = () => {
    if (transition) {
      setPopoverOpen(true)
    } else if (onAddTransition) {
      onAddTransition(boundary.id, boundary.allowedTypes[0])
    }
  }

  const icon = (
    <div
      className={`absolute top-0 bottom-0 z-20 flex w-5 -translate-x-1/2 cursor-pointer items-center justify-center`}
      style={{ left: pct(posSeconds, duration) }}
      onClick={handleClick}
      data-boundary-id={boundary.id}
    >
      <div
        className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
          transition
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted-foreground/30 text-muted-foreground hover:bg-muted-foreground/50'
        }`}
      >
        <Shuffle className="h-2.5 w-2.5" />
      </div>
    </div>
  )

  if (transition && onUpdateTransition && onDeleteTransition) {
    return (
      <TransitionPopover
        transition={transition}
        allowedTypes={boundary.allowedTypes}
        open={popoverOpen}
        onOpenChange={setPopoverOpen}
        onUpdate={onUpdateTransition}
        onDelete={onDeleteTransition}
      >
        {icon}
      </TransitionPopover>
    )
  }

  return icon
}
