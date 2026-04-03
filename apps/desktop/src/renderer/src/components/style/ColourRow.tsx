import React from 'react'
import { ColourPicker } from './ColourPicker'

interface ColourRowProps {
  label: string
  value: string
  onChange: (colour: string) => void
}

export function ColourRow({ label, value, onChange }: ColourRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <ColourPicker value={value} onChange={onChange} />
        <span className="w-24 truncate font-mono text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  )
}
