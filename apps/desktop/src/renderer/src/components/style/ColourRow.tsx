import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="flex h-auto items-center gap-2 rounded px-1 py-0.5 hover:bg-background">
            <div
              className="h-4 w-4 shrink-0 rounded border border-border"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-xs text-muted-foreground">{display}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" side="left" align="start">
          <ColourPicker value={value} onChange={onChange} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
