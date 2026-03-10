import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const PLACEHOLDER = '—:--.---'

export const Modern: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 520

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

  // Elapsed time for current lap
  const elapsed = getLapElapsed(currentLap, currentTime)
  const elapsedFormatted = formatLapTime(elapsed)

  // Last completed lap time
  const lastLapTime =
    currentIdx >= 1
      ? formatLapTime(session.timestamps[currentIdx - 1].lap.lapTime)
      : PLACEHOLDER

  // Session best across all drivers
  const allLaps = sessionAllLaps.flat()
  const sessionBestTime =
    allLaps.length > 0
      ? formatLapTime(Math.min(...allLaps.map(l => l.lapTime)))
      : PLACEHOLDER

  const elapsedFontSize = 52 * scale
  const statFontSize = 22 * scale
  const labelFontSize = 11 * scale
  const dividerHeight = 40 * scale
  const padX = 28 * scale
  const statGap = 24 * scale
  const dividerMargin = 20 * scale

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          fontFamily,
          userSelect: 'none',
          paddingLeft: padX,
          paddingRight: padX,
          boxSizing: 'border-box',
          background: [
            'repeating-linear-gradient(-55deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) 2px, transparent 2px, transparent 18px)',
            'rgba(13, 15, 20, 0.88)',
          ].join(', '),
        }}
      >
        {/* Left: large elapsed ticker */}
        <span
          style={{
            flex: 1,
            fontSize: elapsedFontSize,
            fontWeight: 700,
            color: 'white',
            lineHeight: 1,
            letterSpacing: 1 * scale,
          }}
        >
          {elapsedFormatted}
        </span>

        {/* Vertical divider */}
        <div
          style={{
            width: 1 * scale,
            height: dividerHeight,
            background: 'rgba(255,255,255,0.2)',
            flexShrink: 0,
            marginLeft: dividerMargin,
            marginRight: dividerMargin,
          }}
        />

        {/* Right: LAST + BEST stat columns */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: statGap,
          }}
        >
          {/* LAST stat */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2 * scale,
            }}
          >
            <span
              style={{
                fontSize: labelFontSize,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
                letterSpacing: 2 * scale,
                lineHeight: 1,
              }}
            >
              LAST
            </span>
            <span
              style={{
                fontSize: statFontSize,
                fontWeight: 700,
                color: 'white',
                lineHeight: 1,
              }}
            >
              {lastLapTime}
            </span>
          </div>

          {/* BEST stat */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2 * scale,
            }}
          >
            <span
              style={{
                fontSize: labelFontSize,
                fontWeight: 400,
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'uppercase',
                letterSpacing: 2 * scale,
                lineHeight: 1,
              }}
            >
              BEST
            </span>
            <span
              style={{
                fontSize: statFontSize,
                fontWeight: 700,
                color: 'white',
                lineHeight: 1,
              }}
            >
              {sessionBestTime}
            </span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
