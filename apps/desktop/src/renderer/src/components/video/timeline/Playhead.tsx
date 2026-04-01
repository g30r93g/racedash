import React from 'react'
import { formatRulerLabel, pct } from './types'

interface PlayheadProps {
  currentTime: number
  duration: number
}

export const Playhead = React.memo(function Playhead({ currentTime, duration }: PlayheadProps): React.ReactElement {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-10 -translate-x-1/2 flex flex-col items-center"
      style={{ left: pct(currentTime, duration) }}
    >
      <div className="rounded bg-primary px-1 py-px">
        <span className="font-mono text-[10px] text-primary-foreground">{formatRulerLabel(currentTime)}</span>
      </div>
      <div className="w-px flex-1 bg-primary" />
    </div>
  )
})
