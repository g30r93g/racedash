import React from 'react'
import { useCurrentFrame } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime } from '../../timing'

interface Props {
  timestamps: LapTimestamp[]
  fps: number
  count?: number
}

export const LapHistory: React.FC<Props> = ({ timestamps, fps, count = 3 }) => {
  const frame = useCurrentFrame()
  const currentTime = frame / fps
  const currentLap = getLapAtTime(timestamps, currentTime)
  const currentIdx = timestamps.indexOf(currentLap)

  const history = timestamps.slice(Math.max(0, currentIdx - count), currentIdx)

  if (!history.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {history.map(ts => (
        <div
          key={ts.lap.number}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 32,
            fontSize: 26,
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          <span>Lap {ts.lap.number}</span>
          <span>{formatLapTime(ts.lap.lapTime)}</span>
        </div>
      ))}
    </div>
  )
}
