import { useMemo } from 'react'
import type { Lap, LapTimestamp, PositionOverride, SessionMode } from '@racedash/core'
import { getPosition } from './position'

export interface ResolveDisplayedPositionArgs {
  currentTime: number
  raceStart: number
  lastTimingEventTime: number
  computedPosition: number | null
  livePosition?: number | null
  positionOverrides?: PositionOverride[]
}

export function resolveDisplayedPosition({
  currentTime,
  raceStart,
  lastTimingEventTime,
  computedPosition,
  livePosition,
  positionOverrides,
}: ResolveDisplayedPositionArgs): number | null {
  if (currentTime < raceStart) {
    return livePosition ?? computedPosition
  }

  if (positionOverrides != null && positionOverrides.length > 0) {
    for (let i = positionOverrides.length - 1; i >= 0; i--) {
      if (
        positionOverrides[i].timestamp <= currentTime &&
        positionOverrides[i].timestamp > lastTimingEventTime
      ) {
        return positionOverrides[i].position
      }
    }
  }

  return livePosition ?? computedPosition
}

interface UseDisplayedPositionArgs {
  timestamps: LapTimestamp[]
  currentLaps: Lap[]
  sessionAllLaps: Lap[][]
  currentIdx: number
  currentTime: number
  mode: SessionMode
  startingGridPosition?: number
  livePosition?: number | null
  positionOverrides?: PositionOverride[]
}

export function useDisplayedPosition({
  timestamps,
  currentLaps,
  sessionAllLaps,
  currentIdx,
  currentTime,
  mode,
  startingGridPosition,
  livePosition,
  positionOverrides,
}: UseDisplayedPositionArgs): number | null {
  const raceStart = timestamps[0].ytSeconds

  const positions = useMemo<(number | null)[]>(() => {
    const result: (number | null)[] = [startingGridPosition ?? null]
    for (let n = 1; n <= currentLaps.length; n++) {
      result.push(getPosition(mode, n, currentLaps, sessionAllLaps))
    }
    return result
  }, [mode, currentLaps, sessionAllLaps, startingGridPosition])

  const computedPosition: number | null =
    currentTime < raceStart || currentIdx === 0
      ? positions[0]
      : positions[currentIdx + 1] ?? null

  const lastTimingEventTime = currentTime < raceStart ? -Infinity : timestamps[currentIdx].ytSeconds

  return resolveDisplayedPosition({
    currentTime,
    raceStart,
    lastTimingEventTime,
    computedPosition,
    livePosition,
    positionOverrides,
  })
}
