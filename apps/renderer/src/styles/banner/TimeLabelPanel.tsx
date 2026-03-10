import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { getLapAtTime, getCompletedLaps, getSessionBest } from '../../timing'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  fps: number
  variant: 'last' | 'best'
}

function formatBannerTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalS = Math.floor(totalMs / 1000)
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  const sStr = String(s).padStart(2, '0')
  const msStr = String(ms).padStart(3, '0')
  return m > 0 ? `${m}:${sStr}.${msStr}` : `${sStr}.${msStr}`
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

  const completedLaps = getCompletedLaps(timestamps, currentIdx)

  const displayTime = variant === 'last'
    ? completedLaps[completedLaps.length - 1].lap.lapTime
    : getSessionBest(completedLaps)!

  const label = variant === 'last' ? 'LAST' : 'BEST'

  const labelStyle: React.CSSProperties = {
    fontFamily,
    fontSize: 13 * scale,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 2 * scale,
    userSelect: 'none',
  }

  return (
    <div
      style={{
        width: '100%',
        height: 80 * scale,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10 * scale,
      }}
    >
      <span style={labelStyle}>{label}</span>
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
        {formatBannerTime(displayTime)}
      </span>
      <span style={labelStyle}>LAP</span>
    </div>
  )
}
