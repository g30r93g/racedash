import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import type { LapColor } from './lapColor'
import { getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const FLASH_DURATION_SECONDS = 2

const BACKGROUND: Record<'neutral' | LapColor, string> = {
  neutral: '#111111',
  purple:  'rgba(107,33,168,0.95)',
  green:   'rgba(21,128,61,0.95)',
  red:     'rgba(185,28,28,0.95)',
}

interface Props {
  timestamps: LapTimestamp[]
  lapColors: LapColor[]
  currentLap: LapTimestamp
  currentIdx: number
  currentTime: number
  raceEnd: number
  textColor?: string
  bgColor?: string
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
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

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
    if (timeSinceEnd < FLASH_DURATION_SECONDS) {
      const lastIndex = timestamps.length - 1
      displayText = formatTime(timestamps[lastIndex].lap.lapTime)
      bgKey = lapColors[lastIndex]
    } else {
      displayText = 'END'
      bgKey = 'neutral'
    }
  } else {
    const lapElapsed = getLapElapsed(currentLap, currentTime)
    const isFlashing = lapElapsed < FLASH_DURATION_SECONDS && currentIdx > 0

    if (isFlashing) {
      displayText = formatTime(timestamps[currentIdx - 1].lap.lapTime)
      bgKey = lapColors[currentIdx - 1]
    } else {
      displayText = formatTime(lapElapsed)
      bgKey = 'neutral'
    }
  }

  const background = bgKey === 'neutral' && bgColor ? bgColor : BACKGROUND[bgKey]
  const containerStyle: React.CSSProperties = {
    width: 300 * scale,
    height: 80 * scale,
    clipPath: 'polygon(0 0, 100% 0, 83% 100%, 17% 100%)',
    background,
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
