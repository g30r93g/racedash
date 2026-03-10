import React from 'react'
import { useCurrentFrame } from 'remotion'
import type { Lap, LapTimestamp, SessionMode } from '@racedash/core'
import { getLapAtTime } from '../../timing'
import { getPosition } from '../../position'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLaps: Lap[]
  sessionAllLaps: Lap[][]
  fps: number
  mode: SessionMode
}

export const PositionCounter: React.FC<Props> = ({
  timestamps,
  currentLaps,
  sessionAllLaps,
  fps,
  mode,
}) => {
  const frame = useCurrentFrame()
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds
  // Hidden before race starts
  if (currentTime < raceStart) return null

  const currentLap = getLapAtTime(timestamps, currentTime)
  const position = getPosition(mode, currentLap.lap.number, currentLaps, sessionAllLaps)

  return (
    <div
      style={{
        width: 180,
        height: 80,
        // Right-angle trapezium: left edge vertical, right edge angled inward at bottom
        clipPath: 'polygon(0 0, 100% 0, 83% 100%, 0 100%)',
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingRight: 16,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 28,
          fontWeight: 400,
          color: 'white',
          letterSpacing: 1,
          userSelect: 'none',
        }}
      >
        P{position}
      </span>
    </div>
  )
}
