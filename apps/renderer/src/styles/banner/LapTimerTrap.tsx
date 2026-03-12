import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import type { LapColor } from './lapColor'
import { getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  lapColors: LapColor[]
  currentLap: LapTimestamp
  currentIdx: number
  currentTime: number
  raceEnd: number
  textColor?: string
  bgColor?: string
  lapColorPurple?: string
  lapColorGreen?: string
  lapColorRed?: string
  flashDuration?: number
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
  timestamps, lapColors, currentLap, currentIdx, currentTime, raceEnd,
  textColor = 'white', bgColor,
  lapColorPurple, lapColorGreen, lapColorRed, flashDuration,
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const flashDurationSeconds = flashDuration ?? 2

  const lapColorMap: Record<'neutral' | LapColor, string> = useMemo(() => ({
    neutral: bgColor ?? '#111111',
    purple:  lapColorPurple ?? 'rgba(107,33,168,0.95)',
    green:   lapColorGreen  ?? 'rgba(21,128,61,0.95)',
    red:     lapColorRed    ?? 'rgba(185,28,28,0.95)',
  }), [bgColor, lapColorPurple, lapColorGreen, lapColorRed])

  const spanStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 36 * scale,
    fontWeight: 400,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const raceStart = timestamps[0].ytSeconds
  if (currentTime < raceStart) return null

  let displayText: string
  let bgKey: 'neutral' | LapColor

  if (currentTime >= raceEnd) {
    const timeSinceEnd = currentTime - raceEnd
    if (timeSinceEnd < flashDurationSeconds) {
      const lastIndex = timestamps.length - 1
      displayText = formatTime(timestamps[lastIndex].lap.lapTime)
      bgKey = lapColors[lastIndex]
    } else {
      displayText = 'END'
      bgKey = 'neutral'
    }
  } else {
    const lapElapsed = getLapElapsed(currentLap, currentTime)
    const isFlashing = lapElapsed < flashDurationSeconds && currentIdx > 0

    if (isFlashing) {
      displayText = formatTime(timestamps[currentIdx - 1].lap.lapTime)
      bgKey = lapColors[currentIdx - 1]
    } else {
      displayText = formatTime(lapElapsed)
      bgKey = 'neutral'
    }
  }

  const background = lapColorMap[bgKey]
  const containerStyle: React.CSSProperties = {
    width: 300 * scale,
    height: 80 * scale,
    background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: `${24 * scale}px`,
    cornerShape: 'concave',
  } as React.CSSProperties

  return (
    <div style={containerStyle}>
      <span style={spanStyle}>{displayText}</span>
    </div>
  )
}
