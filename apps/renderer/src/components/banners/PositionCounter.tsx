import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { Lap, LapTimestamp, PositionOverride, SessionMode } from '@racedash/core'
import { useDisplayedPosition } from '../../displayedPosition'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLaps: Lap[]
  sessionAllLaps: Lap[][]
  currentIdx: number
  currentTime: number
  mode: SessionMode
  startingGridPosition?: number
  textColor?: string
  /** When provided, overrides the computed position (e.g. from the live qualifying table). */
  livePosition?: number | null
  positionOverrides?: PositionOverride[]
  placeholderText?: string
}

export const PositionCounter: React.FC<Props> = ({
  timestamps, currentLaps, sessionAllLaps,
  currentIdx, currentTime,
  mode, startingGridPosition, textColor = 'white',
  livePosition,
  positionOverrides,
  placeholderText,
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const position = useDisplayedPosition({
    timestamps,
    currentLaps,
    sessionAllLaps,
    currentIdx,
    currentTime,
    mode,
    startingGridPosition,
    livePosition,
    positionOverrides,
  })

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    width: 180 * scale,
    height: 80 * scale,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 11 * scale,
    paddingLeft: 16 * scale,
    gap: 2 * scale,
  }), [scale])

  const labelStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 13 * scale,
    fontWeight: 700,
    color: textColor,
    opacity: 0.75,
    letterSpacing: 2 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const valueStyle = useMemo<React.CSSProperties>(() => ({
    fontFamily,
    fontSize: 44 * scale,
    fontWeight: 700,
    lineHeight: 1,
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  const displayText = position != null ? `P${position}` : placeholderText

  return (
    <div style={containerStyle}>
      {displayText != null && (
        <>
          <span style={labelStyle}>POSITION</span>
          <span style={valueStyle}>{displayText}</span>
        </>
      )}
    </div>
  )
}
