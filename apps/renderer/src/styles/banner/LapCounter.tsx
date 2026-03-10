import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { getLapAtTime } from '../../timing'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  fps: number
}

export const LapCounter: React.FC<Props> = ({ timestamps, fps }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds
  const total = timestamps.length

  // Hidden before race starts
  if (currentTime < raceStart) return null

  const currentLap = getLapAtTime(timestamps, currentTime)
  const displayText = `${String(currentLap.lap.number).padStart(2, '0')}/${total}`

  return (
    <div
      style={{
        width: 180 * scale,
        height: 80 * scale,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingRight: 16 * scale,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 28 * scale,
          fontWeight: 700,
          color: 'white',
          letterSpacing: 1 * scale,
          userSelect: 'none',
        }}
      >
        {displayText}
      </span>
    </div>
  )
}
