import React, { useMemo } from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { BoxPosition, LeaderboardDriver } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { buildLeaderboard, selectWindow, LeaderboardMode } from '../../leaderboard'
import { fontFamily } from '../../Root'

interface LeaderboardTableProps {
  leaderboardDrivers: LeaderboardDriver[]
  ourKart: string
  mode: LeaderboardMode
  fps: number
  accentColor?: string
  position?: BoxPosition
  /** Anchor top in 1920-reference pixels; overrides vertical position from `position` */
  anchorTop?: number
}

export const LeaderboardTable = React.memo(function LeaderboardTable({
  leaderboardDrivers,
  ourKart,
  mode,
  fps,
  accentColor = '#3DD73D',
  position = 'bottom-right',
  anchorTop,
}: LeaderboardTableProps) {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 1920

  const currentTime = frame / fps

  const leaderboard = useMemo(
    () => buildLeaderboard(leaderboardDrivers, currentTime, mode),
    [leaderboardDrivers, currentTime, mode],
  )

  const rows = useMemo(
    () => selectWindow(leaderboard, ourKart, mode),
    [leaderboard, ourKart, mode],
  )

  if (rows.length === 0) return null

  const p1Time = rows[0].best
  const hasSeparator = rows.length > 1 && rows[1].position > 2

  const vPos = anchorTop !== undefined
    ? { top: anchorTop * sc }
    : position.startsWith('top') ? { top: 20 * sc } : { bottom: 20 * sc }
  const hPos = position.endsWith('left') ? { left: 20 * sc } : { right: 20 * sc }

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    ...vPos,
    ...hPos,
    width: 360 * sc,
    fontFamily,
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
  }

  return (
    <div style={containerStyle}>
      {rows.map((row, i) => {
        const isOurs = row.kart === ourKart
        const isP1 = row.position === 1
        const showSeparator = hasSeparator && i === 1

        let lapDisplay: string
        if (mode === 'race') {
          lapDisplay = isP1 ? 'Interval' : (row.interval ?? '')
        } else {
          lapDisplay = isP1 ? formatLapTime(p1Time) : (row.interval ?? '')
        }

        return (
          <React.Fragment key={row.kart}>
            {showSeparator && (
              <div style={{ height: 1 * sc, background: 'rgba(255,255,255,0.15)', margin: `${3 * sc}px 0` }} />
            )}
            <TableRow
              position={row.position}
              kart={row.kart}
              name={row.name}
              lapDisplay={lapDisplay}
              isOurs={isOurs}
              isP1={isP1}
              accentColor={accentColor}
              sc={sc}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
})

interface TableRowProps {
  position: number
  kart: string
  name: string
  lapDisplay: string
  isOurs: boolean
  isP1: boolean
  accentColor: string
  sc: number
}

const TableRow = React.memo(function TableRow({
  position, kart, name, lapDisplay, isOurs, isP1, accentColor, sc,
}: TableRowProps) {
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8 * sc,
    padding: `${6 * sc}px ${10 * sc}px`,
    background: isOurs
      ? `linear-gradient(${accentColor}30, ${accentColor}30), rgba(0,0,0,0.82)`
      : 'rgba(0,0,0,0.65)',
    borderLeft: isOurs ? `3px solid ${accentColor}` : '3px solid transparent',
    backdropFilter: 'blur(8px)',
    marginBottom: 2 * sc,
  }

  return (
    <div style={rowStyle}>
      <span style={{ width: 22 * sc, fontSize: 11 * sc, fontWeight: 700, color: isP1 ? accentColor : 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
        P{position}
      </span>
      <span style={{ width: 28 * sc, fontSize: 11 * sc, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
        {kart}
      </span>
      <span style={{ flex: 1, fontSize: 12 * sc, fontWeight: isOurs ? 700 : 400, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <span style={{ fontSize: 13 * sc, fontWeight: 600, color: isP1 ? accentColor : 'rgba(255,255,255,0.8)', letterSpacing: 0.5 * sc, flexShrink: 0 }}>
        {lapDisplay}
      </span>
    </div>
  )
})
