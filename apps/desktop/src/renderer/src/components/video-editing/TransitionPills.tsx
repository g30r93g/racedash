import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { TransitionType } from '../../../../../types/videoEditing'

const TRANSITION_TYPES: { type: TransitionType; label: string }[] = [
  { type: 'fadeFromBlack', label: 'Fade From Black' },
  { type: 'fadeToBlack', label: 'Fade To Black' },
  { type: 'fadeThroughBlack', label: 'Fade Through Black' },
  { type: 'crossfade', label: 'Crossfade' },
]

function DraggablePill({ type, label }: { type: TransitionType; label: string }): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `transition-pill-${type}`,
    data: { type: 'transition-pill', transitionType: type },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cursor-grab rounded-md border border-border bg-accent px-2 py-1 text-[10px] text-foreground select-none hover:bg-accent/80 ${isDragging ? 'opacity-50' : ''}`}
    >
      {label}
    </div>
  )
}

export function TransitionPills(): React.ReactElement {
  return (
    <section>
      <span className="mb-2 block text-xs font-medium text-muted-foreground">Transitions</span>
      <div className="flex flex-wrap gap-1.5">
        {TRANSITION_TYPES.map(({ type, label }) => (
          <DraggablePill key={type} type={type} label={label} />
        ))}
      </div>
    </section>
  )
}
