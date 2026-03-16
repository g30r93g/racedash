import React, { useRef, useState } from 'react'

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

interface ColourRowProps {
  label: string
  value: string
  onChange: (hex: string) => void
}

export function ColourRow({ label, value, onChange }: ColourRowProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value
    setDraft(hex)
    onChange(hex)
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setDraft(raw)
    if (isValidHex(raw)) onChange(raw)
  }

  function handleHexBlur() {
    if (!isValidHex(draft)) setDraft(value)
  }

  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="color"
          value={isValidHex(value) ? value : '#000000'}
          onChange={handleNativeChange}
          className="sr-only"
          tabIndex={-1}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="h-5 w-5 rounded border border-border"
          style={{ backgroundColor: isValidHex(value) ? value : '#000000' }}
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
      </div>
    </div>
  )
}
