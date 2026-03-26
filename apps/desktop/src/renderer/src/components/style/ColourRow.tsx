import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

// Parse hex (#rrggbb) or rgba(r, g, b, a) → { hex, alpha 0-100 }
function parseColour(value: string): { hex: string; alpha: number } {
  const rgba = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (rgba) {
    const r = parseInt(rgba[1], 10)
    const g = parseInt(rgba[2], 10)
    const b = parseInt(rgba[3], 10)
    const a = rgba[4] !== undefined ? Math.round(parseFloat(rgba[4]) * 100) : 100
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
    return { hex, alpha: Math.min(100, Math.max(0, a)) }
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return { hex: value, alpha: 100 }
  return { hex: '#000000', alpha: 100 }
}

// Serialize { hex, alpha } → rgba string (or plain hex when fully opaque)
function serializeColour(hex: string, alpha: number): string {
  if (alpha >= 100) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${(alpha / 100).toFixed(2)})`
}

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

interface ColourRowProps {
  label: string
  value: string
  onChange: (colour: string) => void
}

export function ColourRow({ label, value, onChange }: ColourRowProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const { hex: initHex, alpha: initAlpha } = parseColour(value)
  const [hex, setHex] = useState(initHex)
  const [alpha, setAlpha] = useState(initAlpha)
  const [draft, setDraft] = useState(initHex)

  useEffect(() => {
    const { hex: h, alpha: a } = parseColour(value)
    setHex(h)
    setAlpha(a)
    setDraft(h)
  }, [value])

  function emit(h: string, a: number) {
    onChange(serializeColour(h, a))
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const h = e.target.value
    setHex(h)
    setDraft(h)
    emit(h, alpha)
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDraft(raw)
    if (isValidHex(raw)) {
      setHex(raw)
      emit(raw, alpha)
    }
  }

  function handleHexBlur() {
    if (!isValidHex(draft)) setDraft(hex)
  }

  function handleAlphaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const a = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0))
    setAlpha(a)
    emit(hex, a)
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="color"
          value={isValidHex(hex) ? hex : '#000000'}
          onChange={handleNativeChange}
          className="sr-only"
          tabIndex={-1}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => inputRef.current?.click()}
          className="h-5 w-5 rounded border border-border p-0"
          style={{ backgroundColor: isValidHex(hex) ? hex : '#000000', opacity: alpha / 100 }}
          aria-label={`Pick colour for ${label}`}
        />
        <input
          type="text"
          value={draft}
          onChange={handleHexInput}
          onBlur={handleHexBlur}
          maxLength={7}
          className="w-20 rounded border border-border bg-accent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={alpha}
            onChange={handleAlphaChange}
            className="w-12 rounded border border-border bg-accent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>
    </div>
  )
}
