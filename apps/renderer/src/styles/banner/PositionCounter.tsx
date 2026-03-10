import React, { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { Lap, LapTimestamp, SessionMode } from '@racedash/core'
import { getLapAtTime } from '../../timing'
import { getPosition } from '../../position'
import { fontFamily } from '../../Root'

interface Props {
  timestamps: LapTimestamp[]
  currentLaps: Lap[]
  sessionAllLaps: Lap[][]
  fps: number
  mode: SessionMode
  startingGridPosition?: number
  textColor?: string
}

export const PositionCounter: React.FC<Props> = ({
  timestamps,
  currentLaps,
  sessionAllLaps,
  fps,
  mode,
  startingGridPosition,
  textColor = 'white',
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const raceStart = timestamps[0].ytSeconds

  const currentLap = useMemo(() => getLapAtTime(timestamps, currentTime), [timestamps, currentTime])
  const currentIdx = useMemo(() => timestamps.indexOf(currentLap), [timestamps, currentLap])
  const position = useMemo<number | null>(() => {
    if (currentTime < raceStart || currentIdx === 0) return startingGridPosition ?? null
    return getPosition(mode, currentLap.lap.number, currentLaps, sessionAllLaps)
  }, [currentTime, raceStart, currentIdx, startingGridPosition, mode, currentLap, currentLaps, sessionAllLaps])

  const containerStyle = useMemo<React.CSSProperties>(() => ({
    width: 180 * scale,
    height: 80 * scale,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: textColor,
    letterSpacing: 1 * scale,
    userSelect: 'none',
  }), [scale, textColor])

  // Always render at full width so the flex layout keeps the centre element centred
  return (
    <div style={containerStyle}>
      {position != null && (
        <>
          <span style={labelStyle}>POSITION</span>
          <span style={valueStyle}>P{position}</span>
        </>
      )}
    </div>
  )
}
