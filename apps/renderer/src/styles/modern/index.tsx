import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { fontFamily } from '../../Root'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'

const PLACEHOLDER = '—:--.---'

export const Modern: React.FC<OverlayProps> = ({ segments, fps, styling, labelWindowSeconds, qualifyingTablePosition }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps, mode } = segment

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

  const allLaps = useMemo(() => sessionAllLaps.flat(), [sessionAllLaps])
  const sessionBestTime = useMemo(
    () => allLaps.length > 0
      ? formatLapTime(allLaps.reduce((min, l) => Math.min(min, l.lapTime), Infinity))
      : PLACEHOLDER,
    [allLaps],
  )

  const lastLapTime = useMemo(
    () => currentIdx >= 1
      ? formatLapTime(session.timestamps[currentIdx - 1].lap.lapTime)
      : PLACEHOLDER,
    [currentIdx, session.timestamps],
  )

  const styles = useMemo(() => {
    const padX = 103 * scale       // was 28 in 520-ref → 28*(1920/520) ≈ 103
    const statGap = 89 * scale     // was 24 → 89
    const dividerMargin = 74 * scale // was 20 → 74
    return {
      container: {
        position: 'absolute' as const,
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520 * scale,          // 520px at 1920-ref scale → same physical width as before
        height: 96 * scale,          // 96px at 1920-ref scale → same physical height as before
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'center',
        fontFamily,
        userSelect: 'none' as const,
        paddingLeft: padX,
        paddingRight: padX,
        boxSizing: 'border-box' as const,
        background: [
          'repeating-linear-gradient(-55deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) 2px, transparent 2px, transparent 18px)',
          'rgba(13, 15, 20, 0.88)',
        ].join(', '),
      },
      elapsed: {
        flex: 1,
        fontSize: 192 * scale,    // was 52 → 192
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
        letterSpacing: 4 * scale, // was 1 → 4
      },
      divider: {
        width: 4 * scale,         // was 1 → 4
        height: 148 * scale,      // was 40 → 148
        background: 'rgba(255,255,255,0.2)',
        flexShrink: 0,
        marginLeft: dividerMargin,
        marginRight: dividerMargin,
      },
      statGroup: {
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'center',
        gap: statGap,
      },
      statCol: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start' as const,
        gap: 7 * scale,           // was 2 → 7
      },
      label: {
        fontSize: 41 * scale,     // was 11 → 41
        fontWeight: 400,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase' as const,
        letterSpacing: 7 * scale, // was 2 → 7
        lineHeight: 1,
      },
      statValue: {
        fontSize: 81 * scale,     // was 22 → 81
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
      },
    }
  }, [scale])

  if (currentTime < raceStart && !isEnd) return null

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return (
    <AbsoluteFill>
      <div style={styles.container}>
        <span style={styles.elapsed}>{elapsedFormatted}</span>
        <div style={styles.divider} />
        <div style={styles.statGroup}>
          <div style={styles.statCol}>
            <span style={styles.label}>LAST</span>
            <span style={styles.statValue}>{lastLapTime}</span>
          </div>
          <div style={styles.statCol}>
            <span style={styles.label}>BEST</span>
            <span style={styles.statValue}>{sessionBestTime}</span>
          </div>
        </div>
      </div>
      {showTable && (
        <LeaderboardTable
          mode={mode}
          leaderboardDrivers={segment.leaderboardDrivers!}
          ourKart={session.driver.kart}
          fps={fps}
          leaderboardStyling={styling?.leaderboard}
          position={qualifyingTablePosition}
          raceLapSnapshots={segment.raceLapSnapshots}
        />
      )}
      {label && <SegmentLabel label={label} scale={scale} />}
    </AbsoluteFill>
  )
}
