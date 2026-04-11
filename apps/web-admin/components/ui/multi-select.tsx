'use client'

import { useState, useRef, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'

interface MultiSelectOption {
  label: string
  value: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}

export function MultiSelect({ options, value, onChange, placeholder = 'Select...' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function toggleValue(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v))
    } else {
      onChange([...value, v])
    }
  }

  function removeValue(v: string) {
    onChange(value.filter((x) => x !== v))
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 flex-wrap min-h-[38px] w-full px-3 py-1.5 border border-border rounded-md text-sm bg-background text-left"
      >
        {value.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
        {value.map((v) => {
          const opt = options.find((o) => o.value === v)
          return (
            <Badge
              key={v}
              variant="secondary"
              className="gap-1 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                removeValue(v)
              }}
            >
              {opt?.label ?? v}
              <span aria-hidden>&times;</span>
            </Badge>
          )
        })}
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-md shadow-lg py-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(opt.value)}
                onChange={() => toggleValue(opt.value)}
                className="rounded border-border"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
