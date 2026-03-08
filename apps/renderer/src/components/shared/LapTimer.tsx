import React from 'react'
import { useCurrentFrame } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { getLapAtTime, getLapElapsed } from '../../timing'

interface Props {
  timestamps: LapTimestamp[]
  fps: number
}

export const LapTimer: React.FC<Props> = ({ timestamps, fps }) => {
  const frame = useCurrentFrame()
  const currentTime = frame / fps
  const currentLap = getLapAtTime(timestamps, currentTime)
  const elapsed = getLapElapsed(currentLap, currentTime)

  const m = Math.floor(elapsed / 60)
  const s = Math.floor(elapsed % 60)
  const ms = Math.floor((elapsed % 1) * 1000)

  return (
    <div
      style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: 52,
        fontWeight: 700,
        color: 'white',
        letterSpacing: 2,
      }}
    >
      {m}:{String(s).padStart(2, '0')}.{String(ms).padStart(3, '0')}
    </div>
  )
}
