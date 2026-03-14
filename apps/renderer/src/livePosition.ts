import { useMemo } from 'react'
import type { SessionSegment } from '@racedash/core'
import { buildLeaderboard } from './leaderboard'

export function resolveLivePosition(
  segment: Pick<SessionSegment, 'mode' | 'session' | 'leaderboardDrivers' | 'raceLapSnapshots'>,
  currentTime: number,
): number | null {
  if (segment.leaderboardDrivers == null) return null

  const leaderboard = buildLeaderboard(
    segment.leaderboardDrivers,
    currentTime,
    segment.mode,
    segment.session.driver.kart,
    segment.raceLapSnapshots,
  )

  return leaderboard.find(d => d.kart === segment.session.driver.kart)?.position ?? null
}

export function useLivePosition(
  segment: Pick<SessionSegment, 'mode' | 'session' | 'leaderboardDrivers' | 'raceLapSnapshots'>,
  currentTime: number,
): number | null {
  const { leaderboardDrivers, mode, session, raceLapSnapshots } = segment

  return useMemo(
    () => resolveLivePosition(segment, currentTime),
    [leaderboardDrivers, currentTime, mode, session.driver.kart, raceLapSnapshots],
  )
}
