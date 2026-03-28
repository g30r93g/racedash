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

const PLACEHOLDER = '—:--.---'

export const Modern: React.FC<OverlayProps> = ({
  segments,
  fps,
  styling,
  startingGridPosition,
  boxPosition = 'bottom-center',
  labelWindowSeconds,
  qualifyingTablePosition,
  overlayComponents,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(
    segments,
    currentTime,
    labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS,
  )
  const { session, mode } = segment

  const showTable = segment.leaderboardDrivers != null && isOverlayComponentEnabled(overlayComponents?.leaderboard)

  const raceStart = session.timestamps[0].ytSeconds
  const preRoll = styling?.fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS
  const showFrom = raceStart - preRoll

  const fadeEnabled = styling?.fade?.enabled ?? DEFAULT_FADE_ENABLED
  const fadeDuration = styling?.fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS
  const opacity =
    fadeEnabled && !isEnd
      ? interpolate(currentTime - showFrom, [0, fadeDuration], [0, 1], { extrapolateRight: 'clamp' })
      : 1

  const { elapsedFormatted, lastLapTime, sessionBestTime, displayedPosition } = useCardOverlayState({
    segment,
    isEnd,
    currentTime,
    startingGridPosition,
    placeholder: PLACEHOLDER,
  })

  const mo = styling?.modern
  const stripeOpacity = mo?.stripeOpacity ?? 0.035
  const bgColor = mo?.bgColor ?? 'rgba(13, 15, 20, 0.88)'
  const dividerColor = mo?.dividerColor ?? 'rgba(255,255,255,0.2)'
  const statLabelColor = mo?.statLabelColor ?? 'rgba(255,255,255,0.5)'

  const styles = useMemo(() => {
    const padX = 20 * scale
    const statGap = 14 * scale
    const dividerMargin = 14 * scale
    const verticalPos = boxPosition.startsWith('top') ? { top: 0 } : { bottom: 0 }
    const horizontalPos = boxPosition.endsWith('left')
      ? { left: 0 }
      : boxPosition.endsWith('right')
        ? { right: 0 }
        : { left: '50%', transform: 'translateX(-50%)' }
    return {
      container: {
        position: 'absolute' as const,
        ...verticalPos,
        ...horizontalPos,
        width: 620 * scale,
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
        minWidth: 0,
        fontSize: 44 * scale,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
        letterSpacing: 1 * scale,
        whiteSpace: 'nowrap' as const,
        fontVariantNumeric: 'tabular-nums',
      },
      divider: {
        width: 1 * scale,
        height: 40 * scale,
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
        flexShrink: 0,
      },
      timeStatCol: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start' as const,
        gap: 2 * scale,
        width: 104 * scale,
        flexShrink: 0,
      },
      posStatCol: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start' as const,
        gap: 2 * scale,
        width: 42 * scale,
        flexShrink: 0,
      },
      label: {
        fontSize: 10 * scale,
        fontWeight: 400,
        color: statLabelColor,
        textTransform: 'uppercase' as const,
        letterSpacing: 1.5 * scale,
        lineHeight: 1,
        whiteSpace: 'nowrap' as const,
      },
      statValue: {
        fontSize: 20 * scale,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
        whiteSpace: 'nowrap' as const,
        fontVariantNumeric: 'tabular-nums',
      },
    }
  }, [boxPosition, scale, stripeOpacity, bgColor, dividerColor, statLabelColor])

  if (currentTime < showFrom && !isEnd) return null

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={styles.container}>
        <span style={styles.elapsed}>{elapsedFormatted}</span>
        <div style={styles.divider} />
        <div style={styles.statGroup}>
          <div style={styles.posStatCol}>
            <span style={styles.label}>POS</span>
            <span style={styles.statValue}>{displayedPosition != null ? `P${displayedPosition}` : 'P-'}</span>
          </div>
          <div style={styles.timeStatCol}>
            <span style={styles.label}>LAST</span>
            <span style={styles.statValue}>{lastLapTime}</span>
          </div>
          <div style={styles.timeStatCol}>
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
