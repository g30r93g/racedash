import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { fontFamily } from '../../Root'

const EMPTY_TIME = '—:--.---'

function StopwatchIcon({ size, color = 'white' }: { size: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Crown / top button */}
      <path d="M12 2v2" />
      <path d="M10 2h4" />
      {/* Watch body */}
      <circle cx="12" cy="13" r="8" />
      {/* Hand */}
      <polyline points="12 9 12 13 15 13" />
    </svg>
  )
}

interface TimePanelProps {
  iconBg: string
  label: string
  time: string
  sc: number
  iconBgSize: number
  iconSize: number
}

function TimePanel({ iconBg, label, time, sc, iconBgSize, iconSize }: TimePanelProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16 * sc,
      }}
    >
      {/* Icon square */}
      <div
        style={{
          width: iconBgSize,
          height: iconBgSize,
          background: iconBg,
          borderRadius: 6 * sc,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <StopwatchIcon size={iconSize} />
      </div>

      {/* Label + time */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4 * sc,
        }}
      >
        <span
          style={{
            fontSize: 12 * sc,
            fontWeight: 400,
            color: '#9ca3af',
            letterSpacing: 2 * sc,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 36 * sc,
            fontWeight: 400,
            color: 'white',
            letterSpacing: 1 * sc,
            lineHeight: 1,
          }}
        >
          {time}
        </span>
      </div>
    </div>
  )
}

export const Esports: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 480

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

  // Current lap elapsed
  const elapsed = getLapElapsed(currentLap, currentTime)
  const elapsedFormatted = formatLapTime(elapsed)

  // Heights (design spec)
  const accentH = 8 * sc
  const midH = 140 * sc
  const bottomH = 80 * sc
  const totalH = accentH + midH + bottomH

  // Icon square size
  const iconBgSize = 52 * sc
  const iconSize = 28 * sc

  // Panel gap between the two time panels
  const panelGap = 48 * sc

  // Bottom section padding
  const bottomPadX = 32 * sc

  // Icon-label gap in bottom bar
  const iconLabelGap = 10 * sc

  return (
    <div
      style={{
        width: '100%',
        height: totalH,
        display: 'flex',
        flexDirection: 'column',
        fontFamily,
        userSelect: 'none',
      }}
    >
        {/* 1. Accent bar — blue-to-purple gradient */}
        <div
          style={{
            width: '100%',
            height: accentH,
            background: 'linear-gradient(to right, #2563eb, #7c3aed)',
            flexShrink: 0,
          }}
        />

        {/* 2. Gray middle section */}
        <div
          style={{
            width: '100%',
            height: midH,
            background: '#3f4755',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: panelGap,
            }}
          >
            {/* Left panel: last lap */}
            <TimePanel
              iconBg="#16a34a"
              label="LAST LAP"
              time={lastLapTime}
              sc={sc}
              iconBgSize={iconBgSize}
              iconSize={iconSize}
            />

            {/* Right panel: session best */}
            <TimePanel
              iconBg="#7c3aed"
              label="SESSION BEST"
              time={sessionBestTime}
              sc={sc}
              iconBgSize={iconBgSize}
              iconSize={iconSize}
            />
          </div>
        </div>

        {/* 3. Black bottom section */}
        <div
          style={{
            width: '100%',
            height: bottomH,
            background: '#111',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: bottomPadX,
            paddingRight: bottomPadX,
            boxSizing: 'border-box',
          }}
        >
          {/* Left: stopwatch icon + "CURRENT" label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: iconLabelGap }}>
            <StopwatchIcon size={22 * sc} color="#9ca3af" />
            <span
              style={{
                fontSize: 14 * sc,
                fontWeight: 400,
                color: '#9ca3af',
                letterSpacing: 2 * sc,
                textTransform: 'uppercase',
              }}
            >
              CURRENT
            </span>
          </div>

          {/* Right: elapsed time */}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 32 * sc,
              fontWeight: 400,
              color: 'white',
              letterSpacing: 1 * sc,
            }}
          >
            {elapsedFormatted}
          </span>
        </div>
    </div>
  )
}
