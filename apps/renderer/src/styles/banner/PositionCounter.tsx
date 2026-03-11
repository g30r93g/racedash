import React, { useMemo } from 'react'
import { useVideoConfig } from 'remotion'
import type { Lap, LapTimestamp, SessionMode } from '@racedash/core'
import { getPosition } from '../../position'
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
}

export const PositionCounter: React.FC<Props> = ({
  timestamps, currentLaps, sessionAllLaps,
  currentIdx, currentTime,
  mode, startingGridPosition, textColor = 'white',
  livePosition,
}) => {
  const { width } = useVideoConfig()
  const scale = width / 1920

  const raceStart = timestamps[0].ytSeconds

  // Precompute position for every lap — fires once per session, not per lap change.
  const positions = useMemo<(number | null)[]>(() => {
    const result: (number | null)[] = [startingGridPosition ?? null] // index 0 = pre-race
    for (let n = 1; n <= currentLaps.length; n++) {
      result.push(getPosition(mode, n, currentLaps, sessionAllLaps))
    }
    return result
  }, [mode, currentLaps, sessionAllLaps, startingGridPosition])

  // O(1) lookup per lap change.
  // positions[0] = pre-race; positions[n] = getPosition(..., n, ...) for n=1..N.
  // currentIdx is 0-based → currentLap.lap.number = currentIdx+1 → positions[currentIdx+1].
  const computedPosition: number | null =
    currentTime < raceStart || currentIdx === 0
      ? positions[0]
      : positions[currentIdx + 1] ?? null

  const position = livePosition !== undefined && livePosition !== null ? livePosition : computedPosition

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
