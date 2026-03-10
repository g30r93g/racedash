import React from 'react'
import { useCurrentFrame } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { getLapAtTime } from '../../timing'
import { fontFamily } from '../../Root'

const FLASH_DURATION_SECONDS = 2

interface Props {
  timestamps: LapTimestamp[]
  fps: number
}

export const LapCounter: React.FC<Props> = ({ timestamps, fps }) => {
  const frame = useCurrentFrame()
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds
  const lastTs = timestamps[timestamps.length - 1]
  const raceEnd = lastTs.ytSeconds + lastTs.lap.lapTime

  // Hidden before race starts
  if (currentTime < raceStart) return null

  let displayText: string

  if (currentTime >= raceEnd) {
    const timeSinceEnd = currentTime - raceEnd
    displayText = timeSinceEnd < FLASH_DURATION_SECONDS
      ? `LAP ${lastTs.lap.number}`
      : 'END'
  } else {
    const currentLap = getLapAtTime(timestamps, currentTime)
    displayText = `LAP ${currentLap.lap.number}`
  }

  return (
    <div
      style={{
        width: 180,
        height: 80,
        // Right-angle trapezium: right edge vertical, left edge angled inward at bottom
        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 17% 100%)',
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
        {displayText}
      </span>
    </div>
  )
}
