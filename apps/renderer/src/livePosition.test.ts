import { describe, expect, it } from 'vitest'
import type { LeaderboardDriver, SessionSegment } from '@racedash/core'
import { resolveLivePosition } from './livePosition'

function driver(kart: string, videoStart: number, lapTimes: number[]): LeaderboardDriver {
  let ytSeconds = videoStart
  const timestamps = lapTimes.map((lapTime, i) => {
    const ts = { lap: { number: i + 1, lapTime, cumulative: lapTime }, ytSeconds }
    ytSeconds += lapTime
    return ts
  })
  return { kart, name: `Driver ${kart}`, timestamps }
}

function makeSegment(
  leaderboardDrivers?: LeaderboardDriver[],
): Pick<SessionSegment, 'mode' | 'session' | 'leaderboardDrivers' | 'raceLapSnapshots'> {
  return {
    mode: 'race',
    session: {
      driver: { kart: '2', name: 'Driver 2' },
      laps: [{ number: 1, lapTime: 62, cumulative: 62 }],
      timestamps: [{ lap: { number: 1, lapTime: 62, cumulative: 62 }, ytSeconds: 0 }],
    },
    leaderboardDrivers,
    raceLapSnapshots: undefined,
  }
}

describe('resolveLivePosition', () => {
  it('returns null when leaderboard data is unavailable', () => {
    expect(resolveLivePosition(makeSegment(undefined), 100)).toBeNull()
  })

  it('returns our position from the leaderboard model', () => {
    const d1 = driver('1', 0, [60, 60])
    const d2 = driver('2', 0, [62, 60])
    expect(resolveLivePosition(makeSegment([d1, d2]), 65)).toBe(2)
  })
})
