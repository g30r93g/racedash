import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
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
  startingGridPosition?: number
}

export const PositionCounter: React.FC<Props> = ({
  timestamps,
  currentLaps,
  sessionAllLaps,
  fps,
  mode,
  startingGridPosition,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds

  const currentLap = getLapAtTime(timestamps, currentTime)
  const currentIdx = timestamps.indexOf(currentLap)

  // Before/during lap 1: use starting grid position; after that: computed position
  let position: number
  if (currentTime < raceStart || currentIdx === 0) {
    if (startingGridPosition == null) return null
    position = startingGridPosition
  } else {
    position = getPosition(mode, currentLap.lap.number, currentLaps, sessionAllLaps)
  }

  return (
    <div
      style={{
        width: 180 * scale,
        height: 80 * scale,
        // Right-angle trapezium: left edge vertical, right edge angled inward at bottom
        clipPath: 'polygon(0 0, 100% 0, 83% 100%, 0 100%)',
        background: 'rgba(0,0,0,0.65)',
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
          fontWeight: 400,
          color: 'white',
          letterSpacing: 1 * scale,
          userSelect: 'none',
        }}
      >
        P{position}
      </span>
    </div>
  )
}
