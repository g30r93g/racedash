import React from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Boundary, Transition, TransitionType } from '../../../../../types/videoEditing'
import { TransitionPopover } from './TransitionPopover'

const TYPE_LABELS: Record<TransitionType, string> = {
  fadeFromBlack: 'Fade From Black',
  fadeToBlack: 'Fade To Black',
  fadeThroughBlack: 'Fade Through Black',
  crossfade: 'Crossfade',
}

function formatTime(frame: number, fps: number): string {
  const s = frame / fps
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface TransitionListProps {
  transitions: Transition[]
  boundaries: Boundary[]
  fps: number
  onAdd: (boundaryId: string, type: TransitionType) => void
  onUpdate: (updated: Transition) => void
  onDelete: (id: string) => void
  disabled?: boolean
}

export function TransitionList({
  transitions,
  boundaries,
  fps,
  onAdd,
  onUpdate,
  onDelete,
  disabled,
}: TransitionListProps): React.ReactElement {
  const availableBoundaries = boundaries.filter(
    (b) => !transitions.some((t) => t.boundaryId === b.id),
  )

  const handleAdd = () => {
    const boundary = availableBoundaries[0]
    if (!boundary) return
    onAdd(boundary.id, boundary.allowedTypes[0])
  }

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Transitions</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5"
          onClick={handleAdd}
          disabled={disabled || availableBoundaries.length === 0}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {transitions.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No transitions. Click + to add one at a boundary.</p>
      ) : (
        <div className="space-y-1.5">
          {transitions.map((t) => {
            const boundary = boundaries.find((b) => b.id === t.boundaryId)
            if (!boundary) return null
            return (
              <TransitionCard
                key={t.id}
                transition={t}
                boundary={boundary}
                fps={fps}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            )
          })}
        </div>
      )}
      {/* Add at specific boundary */}
      {availableBoundaries.length > 0 && transitions.length > 0 && (
        <div className="mt-2 space-y-1">
          <span className="text-[10px] text-muted-foreground">Add at boundary:</span>
          <Select
            onValueChange={(boundaryId) => {
              const b = boundaries.find((boundary) => boundary.id === boundaryId)
              if (b) onAdd(b.id, b.allowedTypes[0])
            }}
          >
            <SelectTrigger className="h-7 text-[10px]">
              <SelectValue placeholder="Select boundary…" />
            </SelectTrigger>
            <SelectContent>
              {availableBoundaries.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-[10px]">
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </section>
  )
}

function TransitionCard({
  transition,
  boundary,
  fps,
  onUpdate,
  onDelete,
}: {
  transition: Transition
  boundary: Boundary
  fps: number
  onUpdate: (updated: Transition) => void
  onDelete: (id: string) => void
}): React.ReactElement {
  return (
    <TransitionPopover
      transition={transition}
      allowedTypes={boundary.allowedTypes}
      onUpdate={onUpdate}
      onDelete={onDelete}
    >
      <button className="flex w-full flex-col gap-0.5 rounded-md border border-border bg-accent/50 px-2 py-1.5 text-left hover:bg-accent">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-foreground">{TYPE_LABELS[transition.type]}</span>
          <span className="text-[10px] text-muted-foreground">{transition.durationMs}ms</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{boundary.label} · {formatTime(boundary.frameInSource, fps)}</span>
      </button>
    </TransitionPopover>
  )
}
