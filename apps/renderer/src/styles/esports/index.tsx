import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  DEFAULT_LABEL_WINDOW_SECONDS,
  isOverlayComponentEnabled,
  type OverlayProps,
} from '@racedash/core'
import { useActiveSegment } from '../../activeSegment'
import { useFadeOpacity } from '../../useFadeOpacity'
import { useLabelOpacity } from '../../useLabelOpacity'
import { SegmentLabel } from '../../SegmentLabel'
import { fontFamily } from '../../Root'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
import { LapHistory } from '../../components/shared/LapHistory'
import { useCardOverlayState } from '../../useCardOverlayState'
import { StopwatchIcon } from './StopwatchIcon'
import { TimePanel } from './TimePanel'

const EMPTY_TIME = '—:--.---'

export const Esports: React.FC<OverlayProps> = ({
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
  const sc = width / 1920

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

  const raceStart = session.timestamps[0].ytSeconds
  const { opacity, hidden } = useFadeOpacity(currentTime, raceStart, segEnd, isEnd, styling?.fade)

  const labelOpacity = useLabelOpacity(currentTime, labelStart, labelEnd, styling?.segmentLabel)
  const showLabel = label != null && (styling?.segmentLabel?.enabled ?? true)

  const { currentLap, currentIdx, elapsedFormatted, lastLapTime, sessionBestTime, displayedPosition } = useCardOverlayState({
    segment,
    isEnd,
    currentTime,
    startingGridPosition,
    placeholder: EMPTY_TIME,
  })

  const es = styling?.esports
  const accentBarColor = es?.accentBarColor ?? '#2563eb'
  const accentBarColorEnd = es?.accentBarColorEnd ?? '#7c3aed'
  const timePanelsBgColor = es?.timePanelsBgColor ?? '#3f4755'
  const currentBarBgColor = es?.currentBarBgColor ?? '#111'
  const labelColor = es?.labelColor ?? '#9ca3af'
  const lastLapIconColor = es?.lastLapIconColor ?? '#16a34a'
  const sessionBestIconColor = es?.sessionBestIconColor ?? '#7c3aed'

  const configMargin = es?.margin
  const styles = useMemo(() => {
    const mt = (configMargin?.top ?? 20) * sc
    const mr = (configMargin?.right ?? 20) * sc
    const mb = (configMargin?.bottom ?? 20) * sc
    const ml = (configMargin?.left ?? 20) * sc
    const pad = 16 * sc
    const vPos = boxPosition.startsWith('top') ? { top: mt } : { bottom: mb }
    const hPos = boxPosition.endsWith('left')
      ? { left: ml }
      : boxPosition.endsWith('right')
        ? { right: mr }
        : { left: '50%', transform: 'translateX(-50%)' }
    return {
      container: {
        position: 'absolute' as const,
        ...vPos,
        ...hPos,
        width: 400 * sc,
        display: 'flex',
        flexDirection: 'column' as const,
        fontFamily,
        userSelect: 'none' as const,
      },
      accentBar: {
        height: 28 * sc,
        background: `linear-gradient(to right, ${accentBarColor}, ${accentBarColorEnd})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: pad,
        paddingRight: pad,
      },
      positionBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 8 * sc,
        minWidth: 92 * sc,
        height: 18 * sc,
        paddingLeft: 8 * sc,
        paddingRight: 8 * sc,
        borderRadius: 999 * sc,
        background: 'rgba(15,23,42,0.28)',
      },
      positionLabel: {
        fontSize: 9 * sc,
        fontWeight: 800,
        color: 'rgba(255,255,255,0.72)',
        letterSpacing: 1.2 * sc,
        textTransform: 'uppercase' as const,
      },
      positionValue: {
        fontSize: 12 * sc,
        fontWeight: 800,
        color: 'white',
        letterSpacing: 0.5 * sc,
        lineHeight: 1,
      },
      accentText: {
        fontSize: 12 * sc,
        fontWeight: 800,
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 1.5 * sc,
        textTransform: 'uppercase' as const,
      },
      timePanels: {
        background: timePanelsBgColor,
        padding: `${pad}px ${pad}px`,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 14 * sc,
      },
      currentBar: {
        background: currentBarBgColor,
        height: 56 * sc,
        display: 'flex',
        alignItems: 'center',
        gap: 10 * sc,
        paddingLeft: pad,
        paddingRight: pad,
        boxSizing: 'border-box' as const,
      },
      currentLabel: {
        fontSize: 12 * sc,
        fontWeight: 400,
        color: labelColor,
        letterSpacing: 2 * sc,
        textTransform: 'uppercase' as const,
      },
      currentTime: {
        marginLeft: 'auto',
        fontSize: 26 * sc,
        fontWeight: 400,
        color: 'white',
        letterSpacing: 0.5 * sc,
      },
      stopwatchSize: 18 * sc,
    }
  }, [sc, boxPosition, accentBarColor, accentBarColorEnd, timePanelsBgColor, currentBarBgColor, labelColor, configMargin?.top, configMargin?.right, configMargin?.bottom, configMargin?.left])

  if (hidden) return null

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={styles.container}>
        <div style={styles.accentBar}>
          <div style={styles.positionBadge}>
            <span style={styles.positionLabel}>Position</span>
            <span style={styles.positionValue}>{displayedPosition != null ? `P${displayedPosition}` : 'P-'}</span>
          </div>
          <span style={styles.accentText}>
            LAP {currentLap.lap.number} / {session.timestamps.length}
          </span>
        </div>
        <div style={styles.timePanels}>
          <TimePanel iconBg={lastLapIconColor} label="LAST LAP" time={lastLapTime} labelColor={labelColor} sc={sc} />
          <TimePanel
            iconBg={sessionBestIconColor}
            label="SESSION BEST"
            time={sessionBestTime}
            labelColor={labelColor}
            sc={sc}
          />
        </div>
        <div style={styles.currentBar}>
          <StopwatchIcon size={styles.stopwatchSize} color={labelColor} />
          <span style={styles.currentLabel}>CURRENT</span>
          <span style={styles.currentTime}>{elapsedFormatted}</span>
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
      {showLapList && <LapHistory timestamps={session.timestamps} currentIdx={currentIdx} sessionBestTime={null} scale={sc} styling={styling?.lapList} />}
      {showLabel && <SegmentLabel label={label!} scale={sc} styling={styling?.segmentLabel} opacity={labelOpacity} />}
    </AbsoluteFill>
  )
}
