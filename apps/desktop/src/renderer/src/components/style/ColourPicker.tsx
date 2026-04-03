import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import React, { useCallback, useEffect, useRef, useState } from 'react'

// ── Colour conversion helpers ────────────────────────────────────────────────

interface HSVA { h: number; s: number; v: number; a: number }
interface RGBA { r: number; g: number; b: number; a: number }

function rgbaToHsva({ r, g, b, a }: RGBA): HSVA {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  const v = max
  const s = max === 0 ? 0 : d / max
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: h * 360, s: s * 100, v: v * 100, a }
}

function hsvaToRgba({ h, s, v, a }: HSVA): RGBA {
  h /= 360; s /= 100; v /= 100
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  let r = 0, g = 0, b = 0
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break
    case 1: r = q; g = v; b = p; break
    case 2: r = p; g = v; b = t; break
    case 3: r = p; g = q; b = v; break
    case 4: r = t; g = p; b = v; break
    case 5: r = v; g = p; b = q; break
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a }
}

function parseColourString(value: string): RGBA {
  const rgba = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (rgba) {
    return {
      r: parseInt(rgba[1], 10),
      g: parseInt(rgba[2], 10),
      b: parseInt(rgba[3], 10),
      a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
    }
  }
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return {
      r: parseInt(value.slice(1, 3), 16),
      g: parseInt(value.slice(3, 5), 16),
      b: parseInt(value.slice(5, 7), 16),
      a: 1,
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

function rgbaToString({ r, g, b, a }: RGBA): string {
  if (a >= 1) return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`
}

function rgbaToHex({ r, g, b }: RGBA): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

// ── Drag hook ────────────────────────────────────────────────────────────────

function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null)

  const handlePointer = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      const rect = el.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
      onMove(x, y)
    },
    [onMove],
  )

  return { ref, onPointerDown: handlePointer, onPointerMove: (e: React.PointerEvent) => { if (e.buttons > 0) handlePointer(e) } }
}

// ── Components ───────────────────────────────────────────────────────────────

interface ColourPickerProps {
  value: string
  onChange: (value: string) => void
}

export function ColourPicker({ value, onChange }: ColourPickerProps): React.ReactElement {
  const rgba = parseColourString(value)
  const [hsva, setHsva] = useState(() => rgbaToHsva(rgba))
  const [hexDraft, setHexDraft] = useState(() => rgbaToHex(rgba))

  // Sync from external value
  const prevValue = useRef(value)
  if (value !== prevValue.current) {
    prevValue.current = value
    const newRgba = parseColourString(value)
    const newHsva = rgbaToHsva(newRgba)
    // Preserve hue when saturation is 0
    if (newHsva.s === 0) newHsva.h = hsva.h
    setHsva(newHsva)
    setHexDraft(rgbaToHex(newRgba))
  }

  const emit = useCallback(
    (next: HSVA) => {
      setHsva(next)
      const out = hsvaToRgba(next)
      setHexDraft(rgbaToHex(out))
      onChange(rgbaToString(out))
    },
    [onChange],
  )

  // Saturation/Value area
  const svDrag = useDrag((x, y) => emit({ ...hsva, s: x * 100, v: (1 - y) * 100 }))
  // Hue slider
  const hueDrag = useDrag((x) => emit({ ...hsva, h: x * 360 }))
  // Alpha slider
  const alphaDrag = useDrag((x) => emit({ ...hsva, a: +x.toFixed(2) }))

  const currentRgba = hsvaToRgba(hsva)
  const hueColour = `hsl(${hsva.h}, 100%, 50%)`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="h-5 w-5 shrink-0 rounded border border-border"
          style={{ backgroundColor: value }}
          aria-label="Pick colour"
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" side="left" align="start">
        {/* Saturation / Value area */}
        <div
          {...svDrag}
          ref={svDrag.ref}
          className="relative h-32 w-full cursor-crosshair rounded"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColour})` }}
        >
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${hsva.s}%`, top: `${100 - hsva.v}%` }}
          />
        </div>

        {/* Hue slider */}
        <div
          {...hueDrag}
          ref={hueDrag.ref}
          className="relative mt-2 h-3 w-full cursor-pointer rounded"
          style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white shadow"
            style={{ left: `${(hsva.h / 360) * 100}%`, backgroundColor: hueColour }}
          />
        </div>

        {/* Alpha slider */}
        <div
          {...alphaDrag}
          ref={alphaDrag.ref}
          className="relative mt-2 h-3 w-full cursor-pointer rounded"
          style={{
            background: `linear-gradient(to right, transparent, ${rgbaToHex(currentRgba)}), repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 0 0 / 8px 8px`,
          }}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white shadow"
            style={{ left: `${hsva.a * 100}%` }}
          />
        </div>

        {/* Inputs */}
        <div className="mt-2 grid grid-cols-5 gap-1">
          <div className="col-span-2">
            <Input
              value={hexDraft}
              onChange={(e) => {
                setHexDraft(e.target.value)
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  const parsed = parseColourString(e.target.value)
                  emit({ ...rgbaToHsva(parsed), a: hsva.a })
                }
              }}
              onBlur={() => setHexDraft(rgbaToHex(currentRgba))}
              maxLength={7}
              className="h-6 px-1 text-center font-mono text-[10px]"
            />
            <span className="mt-0.5 block text-center text-[8px] text-muted-foreground">HEX</span>
          </div>
          {(['r', 'g', 'b'] as const).map((ch) => (
            <div key={ch}>
              <Input
                type="number"
                min={0}
                max={255}
                value={currentRgba[ch]}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0))
                  emit(rgbaToHsva({ ...currentRgba, [ch]: v }))
                }}
                className="h-6 px-1 text-center font-mono text-[10px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="mt-0.5 block text-center text-[8px] uppercase text-muted-foreground">{ch}</span>
            </div>
          ))}
          <div>
            <Input
              type="number"
              min={0}
              max={100}
              value={Math.round(hsva.a * 100)}
              onChange={(e) => {
                const a = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))
                emit({ ...hsva, a: a / 100 })
              }}
              className="h-6 px-1 text-center font-mono text-[10px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="mt-0.5 block text-center text-[8px] text-muted-foreground">A%</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
