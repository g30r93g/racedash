import { Input } from '@/components/ui/input'
import type { MarginConfig } from '@racedash/core'
import { Minus, Plus } from 'lucide-react'
import React, { useState } from 'react'

interface MarginInputProps {
  label: string
  val: number
  field: keyof MarginConfig
  step: number
  onSet: (field: keyof MarginConfig, value: number) => void
}

export function MarginInput({ label, val, field, step, onSet }: MarginInputProps): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const parsed = parseInt(draft, 10)
    if (!isNaN(parsed)) {
      onSet(field, Math.max(0, parsed))
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <button onClick={() => onSet(field, Math.max(0, val - step))} className="text-muted-foreground hover:text-foreground">
        <Minus className="h-2.5 w-2.5" />
      </button>
      {editing ? (
        <Input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
          min={0}
          step={step}
          autoFocus
          className="h-4 w-6 border-0 bg-transparent p-0 text-center font-mono text-[10px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      ) : (
        <button
          onClick={() => { setDraft(String(val)); setEditing(true) }}
          className="w-5 text-center font-mono text-[10px] text-foreground"
        >
          {val}
        </button>
      )}
      <button onClick={() => onSet(field, val + step)} className="text-muted-foreground hover:text-foreground">
        <Plus className="h-2.5 w-2.5" />
      </button>
      <span className="text-[9px] text-muted-foreground">px</span>
    </div>
  )
}
