import { Input } from '@/components/ui/input'
import { Minus, Plus } from 'lucide-react'
import React, { useState } from 'react'

interface StepperRowProps {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  suffix?: string
}

export function StepperRow({
  label,
  value,
  onChange,
  step = 0.25,
  min = 0,
  suffix = 's',
}: StepperRowProps): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) {
      onChange(Math.max(min, +parsed.toFixed(2)))
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background"
        >
          <Minus className="h-3 w-3" />
        </button>
        {editing ? (
          <Input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
            step={step}
            min={min}
            autoFocus
            className="h-5 w-14 border-border bg-background px-1 text-center font-mono text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        ) : (
          <button
            onClick={() => { setDraft(value.toFixed(2)); setEditing(true) }}
            className="flex h-5 w-14 items-center justify-center rounded font-mono text-xs tabular-nums text-foreground hover:bg-background"
          >
            {value.toFixed(2)}{suffix}
          </button>
        )}
        <button
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
