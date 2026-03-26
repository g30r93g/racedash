import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { LapTimestamp } from '@racedash/core'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLap: LapTimestamp
  currentTime: number
  textColor?: string
  placeholderText?: string
}

export const LapCounter: React.FC<Props> = ({
  timestamps,
  currentLap,
  currentTime,
  textColor = 'white',
  placeholderText,
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const raceStart = timestamps[0].ytSeconds
  const total = timestamps.length

  const displayText = useMemo(() => `${currentLap.lap.number}/${total}`, [currentLap, total])

  const containerStyle = useMemo<React.CSSProperties>(
    () => ({
      width: 180 * scale,
      height: 80 * scale,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 11 * scale,
      paddingRight: 16 * scale,
      gap: 2 * scale,
    }),
    [scale],
  )

  const labelStyle = useMemo<React.CSSProperties>(
    () => ({
      fontFamily,
      fontSize: 13 * scale,
      fontWeight: 700,
      color: textColor,
      opacity: 0.75,
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
      lineHeight: 1,
      color: textColor,
      letterSpacing: 1 * scale,
      userSelect: 'none',
    }),
    [scale, textColor],
  )

  if (currentTime < raceStart && placeholderText == null) return null

  return (
    <div style={containerStyle}>
      <span style={labelStyle}>LAP</span>
      <span style={valueStyle}>{currentTime < raceStart ? placeholderText : displayText}</span>
    </div>
  )
}
