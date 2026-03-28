import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  type OverlayProps,
} from '@racedash/core'
import { useActiveSegment } from '../../activeSegment'
import { InfoSegmentPanel, LapCounter, LapTimerTrap, PositionCounter } from '../../components/banners'
import { SegmentLabel } from '../../SegmentLabel'
import { getLapElapsed } from '../../timing'
import { GeometricBannerBackground } from './GeometricBannerBackground'
import { resolveInfoSegments } from '../../infoSegments'
import { useBannerOverlayState } from '../../useBannerOverlayState'

// SVG natural aspect ratio: viewBox 1010.181 × 110.2687
const SVG_W = 1010.181
const SVG_H = 67.30343
const TIME_PLACEHOLDER = '-:--.---'

export const GeometricBanner: React.FC<OverlayProps> = ({
  segments,
  fps,
  startingGridPosition,
  styling,
  labelWindowSeconds,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const currentTime = frame / fps
  const scale = width / 1920

  const { segment, isEnd, label } = useActiveSegment(
    segments,
    currentTime,
    labelWindowSeconds ?? DEFAULT_LABEL_WINDOW_SECONDS,
  )
  const { session, sessionAllLaps, mode } = segment

  const { currentLap, currentIdx, raceEnd, livePosition, lapColors } = useBannerOverlayState({ segment, currentTime })

  const showTimePanels = mode === 'practice' || mode === 'qualifying'

  const gb = styling?.geometricBanner
  const infoSegments = resolveInfoSegments({
    showTimePanels,
    leftSegment: gb?.leftSegment,
    rightSegment: gb?.rightSegment,
  })

  // Five section colours
  const positionCounterColor = gb?.positionCounterColor ?? '#0bc770'
  const lapCounterColor = gb?.lapCounterColor ?? '#c70b4d'
  const lastLapColor = infoSegments.leftSegment !== 'none' ? (gb?.lastLapColor ?? '#16aa9c') : 'none'
  const previousLapColor = infoSegments.rightSegment !== 'none' ? (gb?.previousLapColor ?? '#7c16aa') : 'none'

  // Timer flash colours
  const timerColorMap = {
    neutral: gb?.lapTimerNeutralColor ?? '#0e0ab8',
    purple: gb?.lapColorPurple ?? 'rgba(107,33,168,0.95)',
    green: gb?.lapColorGreen ?? 'rgba(21,128,61,0.95)',
    red: gb?.lapColorRed ?? 'rgba(185,28,28,0.95)',
  }

  const text = styling?.textColor ?? 'white'
  const bgOpacity = gb?.opacity ?? 1

  const raceStart = session.timestamps[0].ytSeconds
  const preRoll = styling?.fade?.preRollSeconds ?? DEFAULT_FADE_PRE_ROLL_SECONDS
  const showFrom = raceStart - preRoll

  if (currentTime < showFrom && !isEnd) return null

  const fadeEnabled = styling?.fade?.enabled ?? DEFAULT_FADE_ENABLED
  const fadeDuration = styling?.fade?.durationSeconds ?? DEFAULT_FADE_DURATION_SECONDS
  const fadeOpacity =
    fadeEnabled && !isEnd
      ? interpolate(currentTime - showFrom, [0, fadeDuration], [0, 1], { extrapolateRight: 'clamp' })
      : 1

  // Flash logic — identical to Banner
  const flashDurationSeconds = gb?.flashDuration ?? 2
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

  const bannerHeight = Math.round(width * (SVG_H / SVG_W))
  const timePanelYOffset = -(bannerHeight / scale - 80) / 2

  const outerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: bannerHeight,
    overflow: 'hidden',
  }

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height: '100%',
  }

  const bgProps = {
    width,
    height: bannerHeight,
    positionCounterColor,
    lastLapColor,
    lapTimerFill: timerBackground,
    previousLapColor,
    lapCounterColor,
    opacity: bgOpacity,
  }

  const lapTimerProps = {
    timestamps: session.timestamps,
    currentLap,
    currentIdx,
    currentTime,
    raceEnd,
    textColor: gb?.timerTextColor ?? text,
    flashDuration: gb?.flashDuration,
  }

  if (showTimePanels) {
    return (
      <AbsoluteFill style={{ opacity: fadeOpacity }}>
        <div style={outerStyle}>
          <GeometricBannerBackground {...bgProps} />
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
              positionOverrides={segment.positionOverrides}
              placeholderText="P-"
            />
            {infoSegments.leftSegment !== 'none' ? (
              <div style={{ flex: 1 }}>
                <InfoSegmentPanel
                  content={infoSegments.leftSegment}
                  timestamps={session.timestamps}
                  currentIdx={currentIdx}
                  currentTime={currentTime}
                  isEnd={isEnd}
                  textColor={text}
                  yOffset={timePanelYOffset}
                  placeholderText={TIME_PLACEHOLDER}
                />
              </div>
            ) : infoSegments.rightSegment !== 'none' ? (
              <div style={{ flex: 1 }} />
            ) : null}
            <LapTimerTrap {...lapTimerProps} placeholderText={TIME_PLACEHOLDER} />
            {infoSegments.rightSegment !== 'none' ? (
              <div style={{ flex: 1 }}>
                <InfoSegmentPanel
                  content={infoSegments.rightSegment}
                  timestamps={session.timestamps}
                  currentIdx={currentIdx}
                  currentTime={currentTime}
                  isEnd={isEnd}
                  textColor={text}
                  yOffset={timePanelYOffset}
                  placeholderText={TIME_PLACEHOLDER}
                />
              </div>
            ) : infoSegments.leftSegment !== 'none' ? (
              <div style={{ flex: 1 }} />
            ) : null}
            <LapCounter
              timestamps={session.timestamps}
              currentLap={currentLap}
              currentTime={currentTime}
              textColor={text}
              placeholderText="-/-"
            />
          </div>
        </div>
        {label && <SegmentLabel label={label} scale={scale} styling={styling?.segmentLabel} />}
      </AbsoluteFill>
    )
  }

  // Race layout
  return (
    <AbsoluteFill style={{ opacity: fadeOpacity }}>
      <div style={outerStyle}>
        <GeometricBannerBackground {...bgProps} />
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
            positionOverrides={segment.positionOverrides}
            placeholderText="P-"
          />
          <div style={{ flex: 1 }} />
          <LapTimerTrap {...lapTimerProps} placeholderText={TIME_PLACEHOLDER} />
          <div style={{ flex: 1 }} />
          <LapCounter
            timestamps={session.timestamps}
            currentLap={currentLap}
            currentTime={currentTime}
            textColor={text}
            placeholderText="-/-"
          />
        </div>
      </div>
      {label && <SegmentLabel label={label} scale={scale} styling={styling?.segmentLabel} />}
    </AbsoluteFill>
  )
}
