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

export const Modern: React.FC<OverlayProps> = ({ segments, fps, labelWindowSeconds, qualifyingTablePosition }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 520

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, sessionAllLaps, mode } = segment

  const showTable = segment.qualifyingDrivers != null

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
    const padX = 28 * scale
    const statGap = 24 * scale
    const dividerMargin = 20 * scale
    return {
      container: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
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
        fontSize: 52 * scale,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
        letterSpacing: 1 * scale,
      },
      divider: {
        width: 1 * scale,
        height: 40 * scale,
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
        gap: 2 * scale,
      },
      label: {
        fontSize: 11 * scale,
        fontWeight: 400,
        color: 'rgba(255,255,255,0.5)',
        textTransform: 'uppercase' as const,
        letterSpacing: 2 * scale,
        lineHeight: 1,
      },
      statValue: {
        fontSize: 22 * scale,
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
          qualifyingDrivers={segment.qualifyingDrivers!}
          ourKart={session.driver.kart}
          fps={fps}
          accentColor={undefined}
          position={qualifyingTablePosition}
        />
      )}
      {label && <SegmentLabel label={label} scale={scale} />}
    </AbsoluteFill>
  )
}
