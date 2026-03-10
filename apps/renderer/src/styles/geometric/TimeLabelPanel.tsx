import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime } from '../../timing'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  fps: number
  variant: 'last' | 'best'
}

export const TimeLabelPanel: React.FC<Props> = ({ timestamps, fps, variant }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds
  if (currentTime < raceStart) return null

  const currentLap = getLapAtTime(timestamps, currentTime)
  const currentIdx = timestamps.indexOf(currentLap)

  // Need at least 1 completed lap to show anything
  if (currentIdx < 1) return null

  const completedLaps = timestamps.slice(0, currentIdx)

  const displayTime = variant === 'last'
    ? completedLaps[completedLaps.length - 1].lap.lapTime
    : Math.min(...completedLaps.map(ts => ts.lap.lapTime))

  const label = variant === 'last' ? 'LAST' : 'BEST'
  // last: left edge straight, right edge angled inward (mirrors PositionCounter)
  // best: right edge straight, left edge angled inward (mirrors LapCounter)
  const clipPath = variant === 'last'
    ? 'polygon(0 0, 100% 0, 83% 100%, 0 100%)'
    : 'polygon(0 0, 100% 0, 100% 100%, 17% 100%)'

  return (
    <div
      style={{
        width: 220 * scale,
        height: 80 * scale,
        clipPath,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2 * scale,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 13 * scale,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.6)',
          letterSpacing: 2 * scale,
          userSelect: 'none',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily,
          fontSize: 26 * scale,
          fontWeight: 400,
          color: 'white',
          letterSpacing: 1 * scale,
          userSelect: 'none',
        }}
      >
        {formatLapTime(displayTime)}
      </span>
    </div>
  )
}
