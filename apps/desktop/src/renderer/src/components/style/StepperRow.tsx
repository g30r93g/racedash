import React from 'react'

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
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground hover:bg-background"
        >
          −
        </button>
        <span className="w-10 text-center font-mono text-xs tabular-nums text-foreground">
          {value.toFixed(2)}{suffix}
        </span>
        <button
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="flex h-5 w-5 items-center justify-center rounded text-xs text-muted-foreground hover:bg-background"
        >
          +
        </button>
      </div>
    </div>
  )
}
