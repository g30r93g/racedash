import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const EMPTY_TIME = '\u2014:--.---'

interface StatColumnProps {
  label: string
  value: string
  scale: number
}

function StatColumn({ label, value, scale }: StatColumnProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4 * scale,
      }}
    >
      <span
        style={{
          fontSize: 10 * scale,
          fontWeight: 400,
          color: '#aaaaaa',
          letterSpacing: 1.5 * scale,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 18 * scale,
          fontWeight: 700,
          color: 'white',
          letterSpacing: 0.5 * scale,
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
  const scale = width / 1920

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

  // Best lap from any driver completed up to this point in the race
  const raceElapsed = currentTime - session.timestamps[0].ytSeconds
  const completedByNow = sessionAllLaps.flat().filter(l => l.cumulative <= raceElapsed)
  const sessionBestTime =
    completedByNow.length > 0
      ? formatLapTime(Math.min(...completedByNow.map(l => l.lapTime)))
      : EMPTY_TIME

  // Current lap elapsed formatted as m:ss.mmm
  const elapsed = getLapElapsed(currentLap, currentTime)
  const elapsedFormatted = formatLapTime(elapsed)

  // Lap number
  const lapNumber = currentLap.lap.number

  // Dimensions
  const cardW = 440 * scale
  const cardH = 150 * scale
  const borderRadius = 12 * scale
  const padV = 14 * scale
  const padH = 20 * scale
  const rowGap = 12 * scale
  const statRowGap = 28 * scale

  // Lap badge
  const badgeSize = 36 * scale
  const badgeBorderRadius = 4 * scale

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          bottom: 20 * scale,
          left: 20 * scale,
          width: cardW,
          height: cardH,
          background: 'rgba(20, 22, 28, 0.88)',
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
            gap: rowGap,
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
                fontSize: 18 * scale,
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
              fontSize: 58 * scale,
              fontWeight: 700,
              fontStyle: 'italic',
              color: 'white',
              lineHeight: 1,
              letterSpacing: -0.5 * scale,
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
            gap: statRowGap,
          }}
        >
          <StatColumn label="LAST LAP" value={lastLapTime} scale={scale} />
          <StatColumn label="SESSION BEST" value={sessionBestTime} scale={scale} />
        </div>
      </div>
    </AbsoluteFill>
  )
}
