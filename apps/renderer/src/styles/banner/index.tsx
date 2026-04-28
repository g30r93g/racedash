import React from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  DEFAULT_LABEL_WINDOW_SECONDS,
  isOverlayComponentEnabled,
  type LapOverlayProps,
  type OverlayProps,
} from '@racedash/core'
import { useActiveSegment } from '../../activeSegment'
import { useFadeOpacity } from '../../useFadeOpacity'
import { useLabelOpacity } from '../../useLabelOpacity'
import { useLapGate } from '../../hooks/useLapGate'
import { InfoSegmentPanel, LapCounter, LapTimerTrap, PositionCounter } from '../../components/banners'
import { LeaderboardTable } from '../../components/shared/LeaderboardTable'
import { LapHistory } from '../../components/shared/LapHistory'
import { SegmentLabel } from '../../SegmentLabel'
import { getLapElapsed } from '../../timing'
import { BannerBackground } from './BannerBackground'
import { resolveInfoSegments } from '../../infoSegments'
import { useBannerOverlayState } from '../../useBannerOverlayState'

const DEFAULT_ACCENT = '#3DD73D'
const TIME_PLACEHOLDER = '-:--.---'
const LAP_PLACEHOLDER = '-/-'

export const Banner: React.FC<OverlayProps | LapOverlayProps> = (props) => {
  const {
    segments,
    fps,
    startingGridPosition,
    styling,
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
    styling?.fade,
  )
  const { session, sessionAllLaps, mode } = segment

  const { currentLap, currentIdx, raceEnd, livePosition, lapColors } = useBannerOverlayState({ segment, currentTime })

  const showTimePanels = mode === 'practice' || mode === 'qualifying'
  const showTable = segment.leaderboardDrivers != null && (styling?.leaderboard?.enabled ?? false)
  const showLapList = styling?.lapList?.enabled ?? false
  const showPositionCounter = isOverlayComponentEnabled(overlayComponents?.positionCounter)
  const showLapCounter = isOverlayComponentEnabled(overlayComponents?.lapCounter)
  const showLapTimer = isOverlayComponentEnabled(overlayComponents?.lapTimer)

  const accent = styling?.banner?.accentColor ?? DEFAULT_ACCENT
  const text = styling?.banner?.textColor ?? 'white'
  const bannerBg = styling?.banner?.bgColor ?? accent
  const bannerOpacity = styling?.banner?.bgOpacity ?? 0.82
  const bannerRadius = (styling?.banner?.borderRadius ?? 10) * scale
  const infoSegments = resolveInfoSegments({
    showTimePanels,
    leftSegment: styling?.banner?.leftSegment,
    rightSegment: styling?.banner?.rightSegment,
  })

  const raceStart = session.timestamps[0].ytSeconds
  const { opacity, hidden } = useFadeOpacity(currentTime, raceStart, segEnd, isEnd, styling?.fade)

  const labelOpacity = useLabelOpacity(currentTime, labelStart, labelEnd, styling?.segmentLabel)
  const showLabel = label != null && (styling?.segmentLabel?.enabled ?? false)

  if (hidden) return null

  const bannerHeight = 80 * scale
  const margin = styling?.banner?.margin

  const outerStyle: React.CSSProperties = {
    position: 'absolute',
    top: (margin?.top ?? 0) * scale,
    left: (margin?.left ?? 0) * scale,
    right: (margin?.right ?? 0) * scale,
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
    neutral: styling?.banner?.timerBgColor ?? '#111111',
    purple: styling?.banner?.lapColorPurple ?? 'rgba(107,33,168,0.95)',
    green: styling?.banner?.lapColorGreen ?? 'rgba(21,128,61,0.95)',
    red: styling?.banner?.lapColorRed ?? 'rgba(185,28,28,0.95)',
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
    isLapRender: lapGate.isLapRender,
    isLapActive: lapGate.isActive || lapGate.isPastEnd,
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
            {showPositionCounter && (
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
                positionOverrides={segment.positionOverrides}

              />
            )}
            {infoSegments.leftSegment !== 'none' ? (
              <div style={{ flex: 1 }}>
                <InfoSegmentPanel
                  content={infoSegments.leftSegment}
                  timestamps={session.timestamps}
                  currentIdx={currentIdx}
                  currentTime={currentTime}
                  isEnd={isEnd}
                  textColor={text}
                  placeholderText={TIME_PLACEHOLDER}
                />
              </div>
            ) : infoSegments.rightSegment !== 'none' ? (
              <div style={{ flex: 1 }} />
            ) : null}
            {showLapTimer && <LapTimerTrap {...lapTimerProps} placeholderText={TIME_PLACEHOLDER} />}
            {infoSegments.rightSegment !== 'none' ? (
              <div style={{ flex: 1 }}>
                <InfoSegmentPanel
                  content={infoSegments.rightSegment}
                  timestamps={session.timestamps}
                  currentIdx={currentIdx}
                  currentTime={currentTime}
                  isEnd={isEnd}
                  textColor={text}
                  placeholderText={TIME_PLACEHOLDER}
                />
              </div>
            ) : infoSegments.leftSegment !== 'none' ? (
              <div style={{ flex: 1 }} />
            ) : null}
            {showLapCounter && (
              <LapCounter
                timestamps={session.timestamps}
                currentLap={currentLap}
                currentTime={currentTime}
                textColor={text}
                placeholderText={LAP_PLACEHOLDER}
              />
            )}
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
        {showLapList && <LapHistory timestamps={session.timestamps} currentIdx={currentIdx} sessionBestTime={null} scale={scale} styling={styling?.lapList} />}
        {showLabel && <SegmentLabel label={label!} scale={scale} styling={styling?.segmentLabel} opacity={labelOpacity} />}
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
          {showPositionCounter && (
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
              positionOverrides={segment.positionOverrides}
            />
          )}
          {showLapTimer && (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <LapTimerTrap {...lapTimerProps} placeholderText={TIME_PLACEHOLDER} />
            </div>
          )}
          {showLapCounter && (
            <LapCounter
              timestamps={session.timestamps}
              currentLap={currentLap}
              currentTime={currentTime}
              textColor={text}
              placeholderText={LAP_PLACEHOLDER}
            />
          )}
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
      {showLapList && <LapHistory timestamps={session.timestamps} currentIdx={currentIdx} sessionBestTime={null} scale={scale} styling={styling?.lapList} />}
      {showLabel && <SegmentLabel label={label!} scale={scale} styling={styling?.segmentLabel} opacity={labelOpacity} />}
    </AbsoluteFill>
  )
}
