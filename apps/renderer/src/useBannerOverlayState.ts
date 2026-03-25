import { useMemo } from 'react'
import type { LapTimestamp, SessionSegment } from '@racedash/core'
import { useLivePosition } from './livePosition'
import { getLapAtTime } from './timing'
import { computeLapColors, type LapColor } from './components/banners/lapColor'

interface UseBannerOverlayStateArgs {
  segment: SessionSegment
  currentTime: number
}

export interface BannerOverlayState {
  currentLap: LapTimestamp
  currentIdx: number
  raceEnd: number
  livePosition: number | null
  lapColors: LapColor[]
}

export function useBannerOverlayState({
  segment,
  currentTime,
}: UseBannerOverlayStateArgs): BannerOverlayState {
  const { session, sessionAllLaps } = segment

  const lapColors = useMemo(
    () => computeLapColors(session.laps, sessionAllLaps),
    [session.laps, sessionAllLaps],
  )

  const livePosition = useLivePosition(segment, currentTime)

  const currentLap = useMemo(
    () => getLapAtTime(session.timestamps, currentTime),
    [session.timestamps, currentTime],
  )
  const currentIdx = useMemo(
    () => session.timestamps.indexOf(currentLap),
    [session.timestamps, currentLap],
  )
  const raceEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  return {
    currentLap,
    currentIdx,
    raceEnd,
    livePosition,
    lapColors,
  }
}
