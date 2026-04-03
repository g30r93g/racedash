import React from 'react'
import type { MarginConfig } from '@racedash/core'

interface MarginInputProps {
  label: string
  val: number
  field: keyof MarginConfig
  step: number
  onSet: (field: keyof MarginConfig, value: number) => void
}

export function MarginInput({ label, val, field, step, onSet }: MarginInputProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <button onClick={() => onSet(field, val - step)} className="text-[10px] text-muted-foreground hover:text-foreground">−</button>
      <span className="w-5 text-center font-mono text-[10px] text-foreground">{val}</span>
      <button onClick={() => onSet(field, val + step)} className="text-[10px] text-muted-foreground hover:text-foreground">+</button>
      <span className="text-[9px] text-muted-foreground">px</span>
    </div>
  )
}
