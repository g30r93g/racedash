import React, { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import type { LapColor } from './lapColor'
import { getLapAtTime, getLapElapsed } from '../../timing'
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
  fps: number
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

export const LapTimerTrap: React.FC<Props> = ({ timestamps, lapColors, fps, textColor = 'white', bgColor }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds
  const raceEnd = useMemo(() => {
    const lastTs = timestamps[timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [timestamps])

  // Hidden before race starts
  if (currentTime < raceStart) return null

  let displayText: string
  let bgKey: 'neutral' | LapColor

  if (currentTime >= raceEnd) {
    const timeSinceEnd = currentTime - raceEnd
    if (timeSinceEnd < FLASH_DURATION_SECONDS) {
      // Flash the last completed lap's time and color
      const lastIndex = timestamps.length - 1
      displayText = formatTime(timestamps[timestamps.length - 1].lap.lapTime)
      bgKey = lapColors[lastIndex]
    } else {
      displayText = 'END'
      bgKey = 'neutral'
    }
  } else {
    const currentLap = getLapAtTime(timestamps, currentTime)
    const lapElapsed = getLapElapsed(currentLap, currentTime)
    const lapIndex = currentLap.lap.number - 1  // 0-indexed
    const isFlashing = lapElapsed < FLASH_DURATION_SECONDS && lapIndex > 0

    if (isFlashing) {
      // Show the just-completed lap's time (frozen) and its color
      displayText = formatTime(timestamps[lapIndex - 1].lap.lapTime)
      bgKey = lapColors[lapIndex - 1]
    } else {
      displayText = formatTime(lapElapsed)
      bgKey = 'neutral'
    }
  }

  const background = bgKey === 'neutral' && bgColor ? bgColor : BACKGROUND[bgKey]
  // containerStyle depends on bgKey (per-frame), so it is not memoized
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
      <span
        style={{
          fontFamily,
          fontSize: 36 * scale,
          fontWeight: 400,
          color: textColor,
          letterSpacing: 1 * scale,
          userSelect: 'none',
        }}
      >
        {displayText}
      </span>
    </div>
  )
}
