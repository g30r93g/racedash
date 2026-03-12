import React from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import type { DeltaBadgeStyling, LapTimestamp } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime } from '../../timing'

interface Props {
  timestamps: LapTimestamp[]
  fps: number
  styling?: DeltaBadgeStyling
}

export const DeltaBadge: React.FC<Props> = ({ timestamps, fps, styling }) => {
  const frame = useCurrentFrame()
  const currentTime = frame / fps
  const currentLap = getLapAtTime(timestamps, currentTime)
  const currentIdx = timestamps.indexOf(currentLap)

  // Need at least 2 completed laps to show a meaningful delta
  if (currentIdx < 2) return null

  const completedLap = timestamps[currentIdx - 1]  // last completed lap
  const prevLap = timestamps[currentIdx - 2]        // the one before that
  const delta = completedLap.lap.lapTime - prevLap.lap.lapTime
  const isFaster = delta < 0

  const fadeInDuration = styling?.fadeInDuration ?? 0.5
  const lapStartFrame = Math.round(currentLap.ytSeconds * fps)
  const flashProgress = interpolate(frame - lapStartFrame, [0, fps * fadeInDuration], [0, 1], {
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        color: isFaster ? (styling?.fasterColor ?? '#00FF87') : (styling?.slowerColor ?? '#FF3B30'),
        fontFamily: 'Orbitron, monospace',
        fontSize: 32,
        fontWeight: 600,
        opacity: flashProgress,
      }}
    >
      {isFaster ? '-' : '+'}{formatLapTime(Math.abs(delta))}
    </div>
  )
}
