import React from 'react'
import type { MarginConfig } from '@racedash/core'
import { MarginInput } from './MarginInput'

interface MarginEditorProps {
  value: MarginConfig | undefined
  onChange: (margin: MarginConfig) => void
}

export function MarginEditor({ value, onChange }: MarginEditorProps): React.ReactElement {
  const t = value?.top ?? 0
  const r = value?.right ?? 0
  const b = value?.bottom ?? 0
  const l = value?.left ?? 0
  const set = (key: keyof MarginConfig, v: number) => onChange({ ...value, [key]: Math.max(0, v) })
  const step = 1

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <span className="text-xs text-muted-foreground">Margin</span>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-20 items-center justify-center rounded border border-border bg-background">
          <div className="relative flex h-8 w-12 items-center justify-center rounded border-2 border-primary/40 bg-primary/5">
            <span className="absolute -top-3 font-mono text-[8px] text-muted-foreground">{t}</span>
            <span className="absolute -bottom-3 font-mono text-[8px] text-muted-foreground">{b}</span>
            <span className="absolute -left-3.5 font-mono text-[8px] text-muted-foreground">{l}</span>
            <span className="absolute -right-3.5 font-mono text-[8px] text-muted-foreground">{r}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <MarginInput label="T" val={t} field="top" step={step} onSet={set} />
          <MarginInput label="B" val={b} field="bottom" step={step} onSet={set} />
          <MarginInput label="L" val={l} field="left" step={step} onSet={set} />
          <MarginInput label="R" val={r} field="right" step={step} onSet={set} />
        </div>
      </div>
    </div>
  )
}
