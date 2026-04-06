import React from 'react'
import type { TransitionType } from '../../../../../types/videoEditing'

const TRANSITION_TYPES: { type: TransitionType; label: string }[] = [
  { type: 'fadeFromBlack', label: 'Fade From Black' },
  { type: 'fadeToBlack', label: 'Fade To Black' },
  { type: 'fadeThroughBlack', label: 'Fade Through Black' },
  { type: 'crossfade', label: 'Crossfade' },
]

interface TransitionPillsProps {
  onAdd?: (type: TransitionType) => void
}

export function TransitionPills({ onAdd }: TransitionPillsProps): React.ReactElement {
  return (
    <section>
      <span className="mb-2 block text-xs font-medium text-muted-foreground">Transitions</span>
      <div className="flex flex-wrap gap-1.5">
        {TRANSITION_TYPES.map(({ type, label }) => (
          <button
            key={type}
            className="cursor-grab rounded-md border border-border bg-accent px-2 py-1 text-[10px] text-foreground select-none hover:bg-accent/80"
            data-transition-type={type}
            onClick={() => onAdd?.(type)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
