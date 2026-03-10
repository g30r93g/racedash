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
  let position: number | null = null
  if (currentTime < raceStart || currentIdx === 0) {
    position = startingGridPosition ?? null
  } else {
    position = getPosition(mode, currentLap.lap.number, currentLaps, sessionAllLaps)
  }

  // Always render at full width so the flex layout keeps the centre element centred
  return (
    <div
      style={{
        width: 180 * scale,
        height: 80 * scale,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 16 * scale,
      }}
    >
      {position != null && (
        <span
          style={{
            fontFamily,
            fontSize: 44 * scale,
            fontWeight: 700,
            color: 'white',
            letterSpacing: 1 * scale,
            userSelect: 'none',
          }}
        >
          P{position}
        </span>
      )}
    </div>
  )
}
