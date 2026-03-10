import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
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
      <path d="M12 2v2" />
      <path d="M10 2h4" />
      <circle cx="12" cy="13" r="8" />
      <polyline points="12 9 12 13 15 13" />
    </svg>
  )
}

interface TimePanelProps {
  iconBg: string
  label: string
  time: string
  sc: number
}

function TimePanel({ iconBg, label, time, sc }: TimePanelProps) {
  const iconBgSize = 40 * sc
  const iconSize = 22 * sc

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 * sc }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 * sc }}>
        <span
          style={{
            fontSize: 10 * sc,
            fontWeight: 400,
            color: '#9ca3af',
            letterSpacing: 1.5 * sc,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 26 * sc,
            fontWeight: 400,
            color: 'white',
            letterSpacing: 0.5 * sc,
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
  const sc = width / 1920

  const currentTime = frame / fps

  const raceStart = session.timestamps[0].ytSeconds
  if (currentTime < raceStart) return null

  const lastTs = session.timestamps[session.timestamps.length - 1]
  const raceEnd = lastTs.ytSeconds + lastTs.lap.lapTime
  if (currentTime >= raceEnd) return null

  const currentLap = getLapAtTime(session.timestamps, currentTime)
  const currentIdx = session.timestamps.indexOf(currentLap)

  const lastLapTime =
    currentIdx >= 1
      ? formatLapTime(session.timestamps[currentIdx - 1].lap.lapTime)
      : EMPTY_TIME

  const allLaps = sessionAllLaps.flat()
  const sessionBestTime =
    allLaps.length > 0
      ? formatLapTime(Math.min(...allLaps.map(l => l.lapTime)))
      : EMPTY_TIME

  const elapsed = getLapElapsed(currentLap, currentTime)
  const elapsedFormatted = formatLapTime(elapsed)

  const margin = 20 * sc
  const boxW = 400 * sc
  const pad = 16 * sc

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          bottom: margin,
          left: margin,
          width: boxW,
          display: 'flex',
          flexDirection: 'column',
          fontFamily,
          userSelect: 'none',
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            height: 8 * sc,
            background: 'linear-gradient(to right, #2563eb, #7c3aed)',
          }}
        />

        {/* Gray section: two stacked time panels */}
        <div
          style={{
            background: '#3f4755',
            padding: `${pad}px ${pad}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: 14 * sc,
          }}
        >
          <TimePanel iconBg="#16a34a" label="LAST LAP" time={lastLapTime} sc={sc} />
          <TimePanel iconBg="#7c3aed" label="SESSION BEST" time={sessionBestTime} sc={sc} />
        </div>

        {/* Black current-lap bar */}
        <div
          style={{
            background: '#111',
            height: 56 * sc,
            display: 'flex',
            alignItems: 'center',
            gap: 10 * sc,
            paddingLeft: pad,
            paddingRight: pad,
            boxSizing: 'border-box',
          }}
        >
          <StopwatchIcon size={18 * sc} color="#9ca3af" />
          <span
            style={{
              fontSize: 12 * sc,
              fontWeight: 400,
              color: '#9ca3af',
              letterSpacing: 2 * sc,
              textTransform: 'uppercase',
            }}
          >
            CURRENT
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 26 * sc,
              fontWeight: 400,
              color: 'white',
              letterSpacing: 0.5 * sc,
            }}
          >
            {elapsedFormatted}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  )
}
