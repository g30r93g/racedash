import {
  DEFAULT_LABEL_WINDOW_SECONDS,
  isOverlayComponentEnabled,
  type LapOverlayProps,
  type OverlayProps,
} from '@racedash/core'
import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { useActiveSegment } from '../../activeSegment'
import { useFadeOpacity } from '../../useFadeOpacity'
import { useLabelOpacity } from '../../useLabelOpacity'
import { useLapGate } from '../../hooks/useLapGate'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
import { LapHistory } from '../../components/shared/LapHistory'
import { fontFamily } from '../../Root'
import { SegmentLabel } from '../../SegmentLabel'
import { useCardOverlayState } from '../../useCardOverlayState'

const PLACEHOLDER = '—:--.---'

export const Modern: React.FC<OverlayProps | LapOverlayProps> = (props) => {
  const {
    segments,
    fps,
    styling,
    startingGridPosition,
    boxPosition = 'bottom-center',
    labelWindowSeconds,
    qualifyingTablePosition,
    overlayComponents,
  } = props
  const lapGate = useLapGate(props)
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, segEnd, label, labelStart, labelEnd } = useActiveSegment(
    segments,
    currentTime,
    labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS,
    styling?.segmentLabel,
  )
  const { session, mode } = segment

  const showTable = segment.leaderboardDrivers != null && isOverlayComponentEnabled(overlayComponents?.leaderboard)
  const showLapList = isOverlayComponentEnabled(overlayComponents?.lapList)
  const showLapTimer = isOverlayComponentEnabled(overlayComponents?.lapTimer)
  const showPosition = isOverlayComponentEnabled(overlayComponents?.position)
  const showLastLap = isOverlayComponentEnabled(overlayComponents?.lastLap)
  const showSessionBest = isOverlayComponentEnabled(overlayComponents?.sessionBest)
  const showStats = showPosition || showLastLap || showSessionBest
  const showContainer = showLapTimer || showStats

  const raceStart = session.timestamps[0].ytSeconds
  const { opacity, hidden } = useFadeOpacity(currentTime, raceStart, segEnd, isEnd, styling?.fade)

  const labelOpacity = useLabelOpacity(currentTime, labelStart, labelEnd, styling?.segmentLabel)
  const showLabel = label != null && (styling?.segmentLabel?.enabled ?? true)

  const cardState = useCardOverlayState({
    segment,
    isEnd,
    currentTime,
    startingGridPosition,
    placeholder: PLACEHOLDER,
  })
  const gatedInactive = lapGate.isLapRender && !lapGate.isActive
  const currentIdx = cardState.currentIdx
  const elapsedFormatted = gatedInactive ? '0:00.000' : cardState.elapsedFormatted
  const lastLapTime = gatedInactive ? PLACEHOLDER : cardState.lastLapTime
  const sessionBestTime = gatedInactive ? PLACEHOLDER : cardState.sessionBestTime
  const displayedPosition = gatedInactive ? null : cardState.displayedPosition

  const mo = styling?.modern
  const stripeOpacity = mo?.stripeOpacity ?? 0.035
  const bgColor = mo?.bgColor ?? 'rgba(13, 15, 20, 0.88)'
  const dividerColor = mo?.dividerColor ?? 'rgba(255,255,255,0.2)'
  const statLabelColor = mo?.statLabelColor ?? 'rgba(255,255,255,0.5)'

  const configMargin = mo?.margin
  const styles = useMemo(() => {
    const padX = 20 * scale
    const statGap = 14 * scale
    const dividerMargin = 14 * scale
    const mt = (configMargin?.top ?? 0) * scale
    const mr = (configMargin?.right ?? 0) * scale
    const mb = (configMargin?.bottom ?? 0) * scale
    const ml = (configMargin?.left ?? 0) * scale
    const verticalPos = boxPosition.startsWith('top') ? { top: mt } : { bottom: mb }
    const horizontalPos = boxPosition.endsWith('left')
      ? { left: ml }
      : boxPosition.endsWith('right')
        ? { right: mr }
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
  }, [boxPosition, scale, stripeOpacity, bgColor, dividerColor, statLabelColor, configMargin?.top, configMargin?.right, configMargin?.bottom, configMargin?.left])

  if (hidden) return null

  return (
    <AbsoluteFill style={{ opacity }}>
      {showContainer && (
        <div style={styles.container}>
          {showLapTimer && <span style={styles.elapsed}>{elapsedFormatted}</span>}
          {showLapTimer && showStats && <div style={styles.divider} />}
          {showStats && (
            <div style={styles.statGroup}>
              {showPosition && (
                <div style={styles.posStatCol}>
                  <span style={styles.label}>POS</span>
                  <span style={styles.statValue}>{displayedPosition != null ? `P${displayedPosition}` : 'P-'}</span>
                </div>
              )}
              {showLastLap && (
                <div style={styles.timeStatCol}>
                  <span style={styles.label}>LAST</span>
                  <span style={styles.statValue}>{lastLapTime}</span>
                </div>
              )}
              {showSessionBest && (
                <div style={styles.timeStatCol}>
                  <span style={styles.label}>BEST</span>
                  <span style={styles.statValue}>{sessionBestTime}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
      {showLapList && <LapHistory timestamps={session.timestamps} currentIdx={currentIdx} sessionBestTime={null} scale={scale} styling={styling?.lapList} />}
      {showLabel && <SegmentLabel label={label!} scale={scale} styling={styling?.segmentLabel} opacity={labelOpacity} />}
    </AbsoluteFill>
  )
}
