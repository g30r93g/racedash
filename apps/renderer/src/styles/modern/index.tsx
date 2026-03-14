import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  type OverlayProps,
} from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getCompletedLaps, getLapAtTime, getLapElapsed, getSessionBest } from '../../timing'
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
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS)
  const { session, mode } = segment

  const showTable = segment.leaderboardDrivers != null

  const raceStart = session.timestamps[0].ytSeconds
  const segEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const preRoll = styling?.fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS
  const showFrom = raceStart - preRoll

  if (currentTime < showFrom && !isEnd) return null

  const fadeEnabled = styling?.fade?.enabled ?? DEFAULT_FADE_ENABLED
  const fadeDuration = styling?.fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS
  const opacity = fadeEnabled && !isEnd
    ? interpolate(currentTime - showFrom, [0, fadeDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1

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
  const sessionBestTime = useMemo(() => {
    const best = getSessionBest(completedLaps)
    return best !== null ? formatLapTime(best) : PLACEHOLDER
  }, [completedLaps])

  const lastLapTime = useMemo(
    () => currentIdx >= 1
      ? formatLapTime(session.timestamps[currentIdx - 1].lap.lapTime)
      : PLACEHOLDER,
    [currentIdx, session.timestamps],
  )

  const mo = styling?.modern
  const stripeOpacity  = mo?.stripeOpacity  ?? 0.035
  const bgColor        = mo?.bgColor        ?? 'rgba(13, 15, 20, 0.88)'
  const dividerColor   = mo?.dividerColor   ?? 'rgba(255,255,255,0.2)'
  const statLabelColor = mo?.statLabelColor ?? 'rgba(255,255,255,0.5)'

  const styles = useMemo(() => {
    const padX = 103 * scale
    const statGap = 89 * scale
    const dividerMargin = 74 * scale
    return {
      container: {
        position: 'absolute' as const,
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520 * scale,
        height: 96 * scale,
        display: 'flex',
        flexDirection: 'row' as const,
        alignItems: 'center',
        fontFamily,
        userSelect: 'none' as const,
        paddingLeft: padX,
        paddingRight: padX,
        boxSizing: 'border-box' as const,
        background: [
          `repeating-linear-gradient(-55deg, rgba(255,255,255,${stripeOpacity}), rgba(255,255,255,${stripeOpacity}) 2px, transparent 2px, transparent 18px)`,
          bgColor,
        ].join(', '),
      },
      elapsed: {
        flex: 1,
        fontSize: 192 * scale,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
        letterSpacing: 4 * scale,
      },
      divider: {
        width: 4 * scale,
        height: 148 * scale,
        background: dividerColor,
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
        gap: 7 * scale,
      },
      label: {
        fontSize: 41 * scale,
        fontWeight: 400,
        color: statLabelColor,
        textTransform: 'uppercase' as const,
        letterSpacing: 7 * scale,
        lineHeight: 1,
      },
      statValue: {
        fontSize: 81 * scale,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
      },
    }
  }, [scale, stripeOpacity, bgColor, dividerColor, statLabelColor])

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return (
    <AbsoluteFill style={{ opacity }}>
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
      {label && <SegmentLabel label={label} scale={scale} styling={styling?.segmentLabel} />}
    </AbsoluteFill>
  )
}
