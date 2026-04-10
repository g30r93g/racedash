import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { getCompletedLaps, getSessionBest } from '../../timing'
import { fontFamily } from '../../Root'
import { colorWithAlpha } from '../../utils/colorAlpha'

interface Props {
  timestamps: LapTimestamp[]
  currentIdx: number
  currentTime: number
  variant: 'last' | 'best'
  isEnd?: boolean
  textColor?: string
  yOffset?: number
  placeholderText?: string
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

export const TimeLabelPanel: React.FC<Props> = ({
  timestamps,
  currentIdx,
  currentTime,
  variant,
  isEnd = false,
  textColor = 'white',
  yOffset = 0,
  placeholderText,
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const raceStart = timestamps[0].ytSeconds

  const completedLaps = useMemo(
    () => (currentIdx >= 1 || isEnd ? getCompletedLaps(timestamps, currentIdx, isEnd) : []),
    [timestamps, currentIdx, isEnd],
  )
  const displayTime = useMemo(
    () =>
      variant === 'last'
        ? (completedLaps[completedLaps.length - 1]?.lap.lapTime ?? null)
        : getSessionBest(completedLaps),
    [variant, completedLaps],
  )

  const label = variant === 'last' ? 'LAST' : 'BEST'

  const labelStyle = useMemo<React.CSSProperties>(
    () => ({
      fontFamily,
      fontSize: 13 * scale,
      fontWeight: 700,
      color: colorWithAlpha(textColor, 0.75),
      letterSpacing: 2 * scale,
      userSelect: 'none',
    }),
    [scale, textColor],
  )

  const valueStyle = useMemo<React.CSSProperties>(
    () => ({
      fontFamily,
      fontSize: 28 * scale,
      fontWeight: 700,
      color: textColor,
      letterSpacing: 1 * scale,
      userSelect: 'none',
    }),
    [scale, textColor],
  )

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      width: '100%',
      height: 80 * scale,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10 * scale,
      transform: `translateY(${yOffset * scale}px)`,
    }),
    [scale, yOffset],
  )

  const displayText = displayTime != null ? formatBannerTime(displayTime) : placeholderText

  if (currentTime < raceStart && placeholderText == null) return null
  if (currentIdx < 1 && displayTime == null && placeholderText == null) return null
  if (displayText == null) return null

  return (
    <div style={containerStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{displayText}</span>
      <span style={labelStyle}>LAP</span>
    </div>
  )
}
