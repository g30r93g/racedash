import { useMemo } from 'react'
import type { LapTimestamp, SessionSegment } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { useDisplayedPosition } from './displayedPosition'
import { useLivePosition } from './livePosition'
import { getCompletedLaps, getLapAtTime, getLapElapsed, getSessionBest } from './timing'

interface UseCardOverlayStateArgs {
  segment: SessionSegment
  isEnd: boolean
  currentTime: number
  startingGridPosition?: number
  placeholder: string
}

export interface CardOverlayState {
  currentLap: LapTimestamp
  currentIdx: number
  effectiveTime: number
  segEnd: number
  elapsed: number
  elapsedFormatted: string
  completedLaps: LapTimestamp[]
  lastLapTime: string
  sessionBestTime: string
  displayedPosition: number | null
}

export function useCardOverlayState({
  segment,
  isEnd,
  currentTime,
  startingGridPosition,
  placeholder,
}: UseCardOverlayStateArgs): CardOverlayState {
  const { session, sessionAllLaps, mode } = segment

  const segEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const effectiveTime = isEnd ? segEnd - 0.001 : currentTime

  const currentLap = useMemo(() => getLapAtTime(session.timestamps, effectiveTime), [session.timestamps, effectiveTime])
  const currentIdx = useMemo(() => session.timestamps.indexOf(currentLap), [session.timestamps, currentLap])

  const livePosition = useLivePosition(segment, effectiveTime)
  const displayedPosition = useDisplayedPosition({
    timestamps: session.timestamps,
    currentLaps: session.laps,
    sessionAllLaps,
    currentIdx,
    currentTime: effectiveTime,
    mode,
    startingGridPosition,
    livePosition,
    positionOverrides: segment.positionOverrides,
  })

  const completedLaps = useMemo(
    () => getCompletedLaps(session.timestamps, currentIdx, isEnd),
    [session.timestamps, currentIdx, isEnd],
  )
  const lastLapTime = useMemo(
    () => (completedLaps.length > 0 ? formatLapTime(completedLaps[completedLaps.length - 1].lap.lapTime) : placeholder),
    [completedLaps, placeholder],
  )
  const sessionBestTime = useMemo(() => {
    const best = getSessionBest(completedLaps)
    return best !== null ? formatLapTime(best) : placeholder
  }, [completedLaps, placeholder])

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return {
    currentLap,
    currentIdx,
    effectiveTime,
    segEnd,
    elapsed,
    elapsedFormatted,
    completedLaps,
    lastLapTime,
    sessionBestTime,
    displayedPosition,
  }
}
