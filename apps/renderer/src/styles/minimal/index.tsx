import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed, getCompletedLaps, getSessionBest } from '../../timing'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { fontFamily } from '../../Root'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'

const EMPTY_TIME = '—:--.---'

interface StatColumnProps {
  label: string
  value: string
  scale: number
}

const StatColumn = React.memo(function StatColumn({ label, value, scale }: StatColumnProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 * scale }}>
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
})

export const Minimal: React.FC<OverlayProps> = ({ segments, fps, boxPosition = 'bottom-left', labelWindowSeconds, qualifyingTablePosition }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, mode } = segment

  const showTable = segment.leaderboardDrivers != null

  const raceStart = session.timestamps[0].ytSeconds
  const segEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const effectiveTime = isEnd ? segEnd - 0.001 : currentTime

  const currentLap = useMemo(
    () => getLapAtTime(session.timestamps, effectiveTime),
    [session.timestamps, effectiveTime],
  )
  const currentIdx = useMemo(
    () => session.timestamps.indexOf(currentLap),
    [session.timestamps, currentLap],
  )
  const completedLaps = useMemo(
    () => getCompletedLaps(session.timestamps, currentIdx),
    [session.timestamps, currentIdx],
  )
  const lastLapTime = useMemo(
    () => completedLaps.length > 0
      ? formatLapTime(completedLaps[completedLaps.length - 1].lap.lapTime)
      : EMPTY_TIME,
    [completedLaps],
  )
  const sessionBestTime = useMemo(() => {
    const best = getSessionBest(completedLaps)
    return best !== null ? formatLapTime(best) : EMPTY_TIME
  }, [completedLaps])

  const styles = useMemo(() => {
    const margin = 20 * scale
    const vPos = boxPosition.startsWith('top') ? { top: margin } : { bottom: margin }
    const hPos = boxPosition.endsWith('right') ? { right: margin } : { left: margin }
    const padV = 14 * scale
    const padH = 20 * scale
    const badgeSize = 36 * scale
    return {
      card: {
        position: 'absolute' as const,
        ...vPos,
        ...hPos,
        width: 440 * scale,
        height: 150 * scale,
        background: 'rgba(20, 22, 28, 0.88)',
        borderRadius: 12 * scale,
        padding: `${padV}px ${padH}px`,
        boxSizing: 'border-box' as const,
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'space-between',
        fontFamily,
        userSelect: 'none' as const,
      },
      row: {
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'center',
        gap: 12 * scale,
      },
      badge: {
        width: badgeSize,
        height: badgeSize,
        background: 'white',
        borderRadius: 4 * scale,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      },
      badgeText: {
        fontSize: 18 * scale,
        fontWeight: 700,
        color: '#222222',
        lineHeight: 1,
      },
      elapsed: {
        fontSize: 58 * scale,
        fontWeight: 700,
        fontStyle: 'italic',
        color: 'white',
        lineHeight: 1,
        letterSpacing: -0.5 * scale,
      },
      statRow: {
        display: 'flex',
        flexDirection: 'row' as const,
        gap: 28 * scale,
      },
    }
  }, [scale, boxPosition])

  if (currentTime < raceStart && !isEnd) return null

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return (
    <AbsoluteFill>
      <div style={styles.card}>
        <div style={styles.row}>
          <div style={styles.badge}>
            <span style={styles.badgeText}>{currentLap.lap.number}</span>
          </div>
          <span style={styles.elapsed}>{elapsedFormatted}</span>
        </div>
        <div style={styles.statRow}>
          <StatColumn label="LAST LAP" value={lastLapTime} scale={scale} />
          <StatColumn label="SESSION BEST" value={sessionBestTime} scale={scale} />
        </div>
      </div>
      {showTable && (
        <LeaderboardTable
          mode={mode}
          leaderboardDrivers={segment.leaderboardDrivers!}
          ourKart={session.driver.kart}
          fps={fps}
          accentColor={undefined}
          position={qualifyingTablePosition}
          raceLapSnapshots={segment.raceLapSnapshots}
        />
      )}
      {label && <SegmentLabel label={label} scale={scale} />}
    </AbsoluteFill>
  )
}
