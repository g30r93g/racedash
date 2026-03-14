import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLap: LapTimestamp
  currentIdx: number
  currentTime: number
  raceEnd: number
  textColor?: string
  flashDuration?: number
  placeholderText?: string
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  const sStr = String(s).padStart(2, '0')
  const msStr = String(ms).padStart(3, '0')
  return m > 0 ? `${m}:${sStr}.${msStr}` : `${sStr}.${msStr}`
}

export const LapTimerTrap: React.FC<Props> = ({
  timestamps, currentLap, currentIdx, currentTime, raceEnd,
  textColor = 'white', flashDuration, placeholderText,
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const flashDurationSeconds = flashDuration ?? 2

  const spanStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 36 * scale,
    fontWeight: 400,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const raceStart = timestamps[0].ytSeconds
  if (currentTime < raceStart && placeholderText == null) return null

  let displayText: string

  if (currentTime < raceStart) {
    displayText = placeholderText!
  } else if (currentTime >= raceEnd) {
    const timeSinceEnd = currentTime - raceEnd
    displayText = timeSinceEnd < flashDurationSeconds
      ? formatTime(timestamps[timestamps.length - 1].lap.lapTime)
      : 'END'
  } else {
    const lapElapsed = getLapElapsed(currentLap, currentTime)
    const isFlashing = lapElapsed < flashDurationSeconds && currentIdx > 0
    displayText = isFlashing
      ? formatTime(timestamps[currentIdx - 1].lap.lapTime)
      : formatTime(lapElapsed)
  }

  const containerStyle: React.CSSProperties = {
    width: 300 * scale,
    height: 80 * scale,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div style={containerStyle}>
      <span style={spanStyle}>{displayText}</span>
    </div>
  )
}
