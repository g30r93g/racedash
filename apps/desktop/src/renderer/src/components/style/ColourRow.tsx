import React, { useMemo } from 'react'
import { ColourPicker } from './ColourPicker'

function formatColourLabel(value: string): string {
  const rgba = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (rgba) {
    const r = parseInt(rgba[1], 10)
    const g = parseInt(rgba[2], 10)
    const b = parseInt(rgba[3], 10)
    const a = rgba[4] !== undefined ? parseFloat(rgba[4]) : 1
    const hex = `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
    return `${hex}, ${Math.round(a * 100)}%`
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return `${value}, 100%`
  return value
}

interface ColourRowProps {
  label: string
  value: string
  onChange: (colour: string) => void
}

export function ColourRow({ label, value, onChange }: ColourRowProps): React.ReactElement {
  const display = useMemo(() => formatColourLabel(value), [value])

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <ColourPicker value={value} onChange={onChange} />
        <span className="w-24 truncate font-mono text-xs text-muted-foreground">{display}</span>
      </div>
    </div>
  )
}
