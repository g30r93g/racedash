import React, { useMemo } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  type OverlayProps,
} from '@racedash/core'
import { useActiveSegment } from '../../activeSegment'
import { LapCounter, LapTimerTrap, PositionCounter, TimeLabelPanel, computeLapColors } from '../../components/banners'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
import { SegmentLabel } from '../../SegmentLabel'
import { getLapAtTime, getLapElapsed } from '../../timing'
import { BannerBackground } from './BannerBackground'
import { buildLeaderboard } from '../../leaderboard'

const DEFAULT_ACCENT = '#3DD73D'
const TIME_PLACEHOLDER = '-:--.---'
const LAP_PLACEHOLDER = '-/-'
const POSITION_PLACEHOLDER = 'P-'

export const Banner: React.FC<OverlayProps> = ({
  segments, fps, startingGridPosition,
  styling, labelWindowSeconds,
  qualifyingTablePosition,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const { segment, isEnd, label } = useActiveSegment(segments, currentTime, labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS)
  const { session, sessionAllLaps, mode } = segment

  const lapColors = useMemo(() => computeLapColors(session.laps, sessionAllLaps), [session.laps, sessionAllLaps])
  const showTimePanels = mode === 'practice' || mode === 'qualifying'
  const showTable = segment.leaderboardDrivers != null

  // Live position from the leaderboard (all modes, when leaderboard data is present).
  const livePosition = useMemo<number | null>(() => {
    if (!showTable) return null
    const leaderboard = buildLeaderboard(
      segment.leaderboardDrivers!, currentTime, mode,
      session.driver.kart, segment.raceLapSnapshots,
    )
    return leaderboard.find(d => d.kart === session.driver.kart)?.position ?? null
  }, [showTable, segment.leaderboardDrivers, currentTime, mode, session.driver.kart, segment.raceLapSnapshots])

  const accent = styling?.accentColor ?? DEFAULT_ACCENT
  const text = styling?.textColor ?? 'white'
  const bannerBg = styling?.banner?.bgColor ?? accent
  const bannerOpacity = styling?.banner?.bgOpacity ?? 0.82
  const bannerRadius = (styling?.banner?.borderRadius ?? 10) * scale

  const raceStart = session.timestamps[0].ytSeconds
  const preRoll = styling?.fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS
  const showFrom = raceStart - preRoll

  const currentLap = useMemo(() => getLapAtTime(session.timestamps, currentTime), [session.timestamps, currentTime])
  const currentIdx = useMemo(() => session.timestamps.indexOf(currentLap), [session.timestamps, currentLap])
  const raceEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  if (currentTime < showFrom && !isEnd) return null

  const fadeEnabled = styling?.fade?.enabled ?? DEFAULT_FADE_ENABLED
  const fadeDuration = styling?.fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS
  const opacity = fadeEnabled && !isEnd
    ? interpolate(currentTime - showFrom, [0, fadeDuration], [0, 1], { extrapolateRight: 'clamp' })
    : 1

  const bannerHeight = 80 * scale

  const outerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: bannerHeight,
    borderBottomLeftRadius: bannerRadius,
    borderBottomRightRadius: bannerRadius,
    overflow: 'hidden',
  }

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
  }

  // Compute the timer's current background so end caps flash in sync.
  const flashDurationSeconds = styling?.banner?.flashDuration ?? 2
  const timerColorMap = {
    neutral: styling?.banner?.timerBgColor   ?? '#111111',
    purple:  styling?.banner?.lapColorPurple ?? 'rgba(107,33,168,0.95)',
    green:   styling?.banner?.lapColorGreen  ?? 'rgba(21,128,61,0.95)',
    red:     styling?.banner?.lapColorRed    ?? 'rgba(185,28,28,0.95)',
  }
  const timerBackground = (() => {
    if (currentTime >= raceEnd) {
      const sinceEnd = currentTime - raceEnd
      return sinceEnd < flashDurationSeconds
        ? timerColorMap[lapColors[session.timestamps.length - 1] ?? 'neutral']
        : timerColorMap.neutral
    }
    const lapElapsed = getLapElapsed(currentLap, currentTime)
    const isFlashing = lapElapsed < flashDurationSeconds && currentIdx > 0
    return isFlashing ? timerColorMap[lapColors[currentIdx - 1] ?? 'neutral'] : timerColorMap.neutral
  })()

  const lapTimerProps = {
    timestamps: session.timestamps,
    currentLap,
    currentIdx,
    currentTime,
    raceEnd,
    textColor: styling?.banner?.timerTextColor ?? text,
    flashDuration: styling?.banner?.flashDuration,
  }

  if (showTimePanels) {
    return (
      <AbsoluteFill style={{ opacity }}>
        <div style={outerStyle}>
          <BannerBackground
            width={width}
            height={bannerHeight}
            bgFill={bannerBg}
            opacity={bannerOpacity}
            timerFill={timerBackground}
          />
          <div style={wrapperStyle}>
            <PositionCounter
              timestamps={session.timestamps}
              currentLaps={session.laps}
              sessionAllLaps={sessionAllLaps}
              currentIdx={currentIdx}
              currentTime={currentTime}
              mode={mode}
              startingGridPosition={startingGridPosition}
              textColor={text}
              livePosition={livePosition}
              placeholderText={POSITION_PLACEHOLDER}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="last"
                textColor={text}
                placeholderText={TIME_PLACEHOLDER}
              />
            </div>
            <LapTimerTrap {...lapTimerProps} placeholderText={TIME_PLACEHOLDER} />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="best"
                textColor={text}
                placeholderText={TIME_PLACEHOLDER}
              />
            </div>
            <LapCounter
              timestamps={session.timestamps}
              currentLap={currentLap}
              currentTime={currentTime}
              textColor={text}
              placeholderText={LAP_PLACEHOLDER}
            />
          </div>
        </div>
        {showTable && (
          <LeaderboardTable
            mode={mode}
            leaderboardDrivers={segment.leaderboardDrivers!}
            ourKart={session.driver.kart}
            fps={fps}
            accentColor={accent}
            leaderboardStyling={styling?.leaderboard}
            anchorTop={140}
            position={qualifyingTablePosition ?? 'top-right'}
            raceLapSnapshots={segment.raceLapSnapshots}
          />
        )}
        {label && <SegmentLabel label={label} scale={scale} styling={styling?.segmentLabel} />}
      </AbsoluteFill>
    )
  }

  // Race layout
  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={outerStyle}>
        <BannerBackground
          width={width}
          height={bannerHeight}
          bgFill={bannerBg}
          opacity={bannerOpacity}
          timerFill={timerBackground}
        />
        <div style={wrapperStyle}>
          <PositionCounter
            timestamps={session.timestamps}
            currentLaps={session.laps}
            sessionAllLaps={sessionAllLaps}
            currentIdx={currentIdx}
            currentTime={currentTime}
            mode={mode}
            startingGridPosition={startingGridPosition}
            textColor={text}
            livePosition={livePosition}
            placeholderText={POSITION_PLACEHOLDER}
          />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <LapTimerTrap {...lapTimerProps} placeholderText={TIME_PLACEHOLDER} />
          </div>
          <LapCounter
            timestamps={session.timestamps}
            currentLap={currentLap}
            currentTime={currentTime}
            textColor={text}
            placeholderText={LAP_PLACEHOLDER}
          />
        </div>
      </div>
      {showTable && (
        <LeaderboardTable
          mode={mode}
          leaderboardDrivers={segment.leaderboardDrivers!}
          ourKart={session.driver.kart}
          fps={fps}
          accentColor={accent}
          leaderboardStyling={styling?.leaderboard}
          position={qualifyingTablePosition}
          raceLapSnapshots={segment.raceLapSnapshots}
        />
      )}
      {label && <SegmentLabel label={label} scale={scale} styling={styling?.segmentLabel} />}
    </AbsoluteFill>
  )
}
