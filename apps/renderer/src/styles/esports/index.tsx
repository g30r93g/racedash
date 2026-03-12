import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'
import { getLapAtTime, getLapElapsed, getCompletedLaps, getSessionBest } from '../../timing'
import { useActiveSegment } from '../../activeSegment'
import { SegmentLabel } from '../../SegmentLabel'
import { fontFamily } from '../../Root'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'

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
  labelColor: string
  sc: number
}

const TimePanel = React.memo(function TimePanel({ iconBg, label, time, labelColor, sc }: TimePanelProps) {
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
            color: labelColor,
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
})

export const Esports: React.FC<OverlayProps> = ({ segments, fps, styling, boxPosition = 'bottom-left', labelWindowSeconds, qualifyingTablePosition }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const sc = width / 1920

  const currentTime = frame / fps
  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? 5)
  const { session, mode } = segment

  const showTable = segment.leaderboardDrivers != null

  const raceStart = session.timestamps[0].ytSeconds
  const segEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const preRoll = styling?.fade?.preRollSeconds ?? 0
  const showFrom = raceStart - preRoll

  if (currentTime < showFrom && !isEnd) return null

  const fadeEnabled = styling?.fade?.enabled ?? false
  const fadeDuration = styling?.fade?.durationSeconds ?? 0.5
  const opacity = fadeEnabled && !isEnd
    ? interpolate(currentTime - showFrom, [0, fadeDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1

  // Freeze time at last moment of session when in END state (between segments)
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

  const es = styling?.esports
  const accentBarColor    = es?.accentBarColor     ?? '#2563eb'
  const accentBarColorEnd = es?.accentBarColorEnd  ?? '#7c3aed'
  const timePanelsBgColor = es?.timePanelsBgColor  ?? '#3f4755'
  const currentBarBgColor = es?.currentBarBgColor  ?? '#111'
  const labelColor        = es?.labelColor         ?? '#9ca3af'
  const lastLapIconColor  = es?.lastLapIconColor   ?? '#16a34a'
  const sessionBestIconColor = es?.sessionBestIconColor ?? '#7c3aed'

  const styles = useMemo(() => {
    const margin = 20 * sc
    const pad = 16 * sc
    const vPos = boxPosition.startsWith('top') ? { top: margin } : { bottom: margin }
    const hPos = boxPosition.endsWith('right') ? { right: margin } : { left: margin }
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
        justifyContent: 'flex-end',
        paddingRight: pad,
      },
      accentText: {
        fontSize: 12 * sc,
        fontWeight: 700,
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
  }, [sc, boxPosition, accentBarColor, accentBarColorEnd, timePanelsBgColor, currentBarBgColor, labelColor])

  const elapsed = getLapElapsed(currentLap, effectiveTime)
  const elapsedFormatted = formatLapTime(elapsed)

  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={styles.container}>
        <div style={styles.accentBar}>
          <span style={styles.accentText}>
            LAP {currentLap.lap.number} / {session.timestamps.length}
          </span>
        </div>
        <div style={styles.timePanels}>
          <TimePanel iconBg={lastLapIconColor} label="LAST LAP" time={lastLapTime} labelColor={labelColor} sc={sc} />
          <TimePanel iconBg={sessionBestIconColor} label="SESSION BEST" time={sessionBestTime} labelColor={labelColor} sc={sc} />
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
      {label && <SegmentLabel label={label} scale={sc} styling={styling?.segmentLabel} />}
    </AbsoluteFill>
  )
}
