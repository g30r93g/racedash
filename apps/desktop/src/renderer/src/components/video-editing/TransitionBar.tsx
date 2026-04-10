import React, { useState } from 'react'
import type { Transition, Boundary } from '../../../../../types/videoEditing'
import { TransitionPopover } from './TransitionPopover'
import { pct } from '@/components/video/timeline/types'

interface TransitionBarProps {
  transition: Transition
  boundary: Boundary
  duration: number
  fps: number
  onUpdate: (updated: Transition) => void
  onDelete: (id: string) => void
}

export function TransitionBar({ transition, boundary, duration, fps, onUpdate, onDelete }: TransitionBarProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const posSeconds = boundary.frameInSource / fps
  const widthSeconds = transition.durationMs / 1000

  return (
    <TransitionPopover
      transition={transition}
      allowedTypes={boundary.allowedTypes}
      open={open}
      onOpenChange={setOpen}
      onUpdate={onUpdate}
      onDelete={onDelete}
    >
      <div
        className="absolute top-0.5 bottom-0.5 z-20 cursor-pointer rounded-sm bg-primary/30 border border-primary/50 hover:bg-primary/40 transition-colors"
        style={{
          left: `calc(${pct(posSeconds, duration)} - ${pct(widthSeconds / 2, duration)})`,
          width: pct(widthSeconds, duration),
        }}
        onClick={() => setOpen(true)}
      />
    </TransitionPopover>
  )
}
