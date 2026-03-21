import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  isOverlayComponentEnabled,
  type OverlayProps,
} from '@racedash/core'
import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { useActiveSegment } from '../../activeSegment'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
import { fontFamily } from '../../Root'
import { SegmentLabel } from '../../SegmentLabel'
import { useCardOverlayState } from '../../useCardOverlayState'

const EMPTY_TIME = '—:--.---'

interface StatColumnProps {
  label: string
  value: string
  scale: number
  labelColor: string
}

const StatColumn = React.memo(function StatColumn({ label, value, scale, labelColor }: StatColumnProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 * scale }}>
      <span
        style={{
          fontSize: 10 * scale,
          fontWeight: 400,
          color: labelColor,
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

export const Minimal: React.FC<OverlayProps> = ({
  segments,
  fps,
  styling,
  startingGridPosition,
  boxPosition = 'bottom-left',
  labelWindowSeconds,
  qualifyingTablePosition,
  overlayComponents,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS)
  const { session, mode } = segment

  const showTable = segment.leaderboardDrivers != null && isOverlayComponentEnabled(overlayComponents?.leaderboard)

  const raceStart = session.timestamps[0].ytSeconds
  const preRoll = styling?.fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS
  const showFrom = raceStart - preRoll

  const fadeEnabled = styling?.fade?.enabled ?? DEFAULT_FADE_ENABLED
  const fadeDuration = styling?.fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS
  const opacity = fadeEnabled && !isEnd
    ? interpolate(currentTime - showFrom, [0, fadeDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1

  const {
    currentLap, effectiveTime, elapsedFormatted,
    lastLapTime, sessionBestTime, displayedPosition,
  } = useCardOverlayState({
    segment, isEnd, currentTime, startingGridPosition, placeholder: EMPTY_TIME,
  })

  const mn = styling?.minimal
  const cardBgColor    = mn?.bgColor         ?? 'rgba(20, 22, 28, 0.88)'
  const badgeBgColor   = mn?.badgeBgColor    ?? 'white'
  const badgeTextColor = mn?.badgeTextColor  ?? '#222222'
  const statLabelColor = mn?.statLabelColor  ?? '#aaaaaa'

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
        background: cardBgColor,
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
        background: badgeBgColor,
        borderRadius: 4 * scale,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      },
      badgeText: {
        fontSize: 18 * scale,
        fontWeight: 700,
        color: badgeTextColor,
        lineHeight: 1,
      },
      elapsed: {
        fontSize: 58 * scale,
        fontWeight: 700,
        fontStyle: 'italic',
        color: 'white',
        lineHeight: 1,
        letterSpacing: -0.5 * scale,
        flex: 1,
      },
      statRow: {
        display: 'flex',
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        gap: 20 * scale,
      },
    }
  }, [scale, boxPosition, cardBgColor, badgeBgColor, badgeTextColor, statLabelColor])

  if (currentTime < showFrom && !isEnd) return null

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={styles.card}>
        <div style={styles.row}>
          <div style={styles.badge}>
            <span style={styles.badgeText}>{currentLap.lap.number}</span>
          </div>
          <span style={styles.elapsed}>{elapsedFormatted}</span>
        </div>
        <div style={styles.statRow}>
          <StatColumn label="POSITION" value={displayedPosition != null ? `P${displayedPosition}` : 'P-'} scale={scale} labelColor={statLabelColor} />
          <StatColumn label="LAST LAP" value={lastLapTime} scale={scale} labelColor={statLabelColor} />
          <StatColumn label="SESSION BEST" value={sessionBestTime} scale={scale} labelColor={statLabelColor} />
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
