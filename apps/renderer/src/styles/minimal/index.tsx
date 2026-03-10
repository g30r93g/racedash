import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const EMPTY_TIME = '\u2014:\u2014\u2014.\u2014\u2014\u2014'

interface StatColumnProps {
  label: string
  value: string
  sc: number
}

function StatColumn({ label, value, sc }: StatColumnProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4 * sc,
      }}
    >
      <span
        style={{
          fontSize: 10 * sc,
          fontWeight: 400,
          color: '#aaaaaa',
          letterSpacing: 1.5 * sc,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18 * sc,
          fontWeight: 700,
          color: 'white',
          letterSpacing: 0.5 * sc,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  )
}

export const Minimal: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 440

  const currentTime = frame / fps

  // Pre-race guard
  const raceStart = session.timestamps[0].ytSeconds
  if (currentTime < raceStart) return null

  // Post-race guard
  const lastTs = session.timestamps[session.timestamps.length - 1]
  const raceEnd = lastTs.ytSeconds + lastTs.lap.lapTime
  if (currentTime >= raceEnd) return null

  const currentLap = getLapAtTime(session.timestamps, currentTime)
  const currentIdx = session.timestamps.indexOf(currentLap)

  // Last completed lap time
  const lastLapTime =
    currentIdx >= 1
      ? formatLapTime(session.timestamps[currentIdx - 1].lap.lapTime)
      : EMPTY_TIME

  // Session best across all drivers
  const allLaps = sessionAllLaps.flat()
  const sessionBestTime =
    allLaps.length > 0
      ? formatLapTime(Math.min(...allLaps.map(l => l.lapTime)))
      : EMPTY_TIME

  // Current lap elapsed formatted as m:ss.mmm
  const elapsed = getLapElapsed(currentLap, currentTime)
  const elapsedFormatted = formatLapTime(elapsed)

  // Lap number
  const lapNumber = currentLap.lap.number

  // Dimensions
  const cardW = 440 * sc
  const cardH = 150 * sc
  const borderRadius = 12 * sc
  const padV = 14 * sc
  const padH = 20 * sc

  // Lap badge
  const badgeSize = 36 * sc
  const badgeBorderRadius = 4 * sc

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: cardW,
          height: cardH,
          background: '#555555',
          borderRadius,
          padding: `${padV}px ${padH}px`,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily,
          userSelect: 'none',
        }}
      >
        {/* Row 1: Lap badge + elapsed time */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12 * sc,
          }}
        >
          {/* Lap number badge */}
          <div
            style={{
              width: badgeSize,
              height: badgeSize,
              background: 'white',
              borderRadius: badgeBorderRadius,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 18 * sc,
                fontWeight: 700,
                color: '#222222',
                lineHeight: 1,
              }}
            >
              {lapNumber}
            </span>
          </div>

          {/* Elapsed time — large bold italic ticker */}
          <span
            style={{
              fontSize: 58 * sc,
              fontWeight: 700,
              fontStyle: 'italic',
              color: 'white',
              lineHeight: 1,
              letterSpacing: -0.5 * sc,
            }}
          >
            {elapsedFormatted}
          </span>
        </div>

        {/* Row 2: Stat columns */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 28 * sc,
          }}
        >
          <StatColumn label="Last Lap" value={lastLapTime} sc={sc} />
          <StatColumn label="Session Best" value={sessionBestTime} sc={sc} />
        </div>
      </div>
    </AbsoluteFill>
  )
}
