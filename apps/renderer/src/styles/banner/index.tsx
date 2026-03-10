import React, { useMemo } from 'react'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { getLapAtTime } from '../../timing'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'
import { PositionCounter } from './PositionCounter'
import { TimeLabelPanel } from './TimeLabelPanel'

const DEFAULT_ACCENT = '#3DD73D'

export const Banner: React.FC<OverlayProps> = ({
  session, sessionAllLaps, fps, mode, startingGridPosition,
  accentColor, textColor, timerTextColor, timerBgColor,
}) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const scale = width / 1920
  const currentTime = frame / fps

  const lapColors = useMemo(() => computeLapColors(session.laps, sessionAllLaps), [session.laps, sessionAllLaps])
  const showTimePanels = mode === 'practice' || mode === 'qualifying'
  const accent = accentColor ?? DEFAULT_ACCENT
  const text = textColor ?? 'white'

  const currentLap = useMemo(() => getLapAtTime(session.timestamps, currentTime), [session.timestamps, currentTime])
  const currentIdx = useMemo(() => session.timestamps.indexOf(currentLap), [session.timestamps, currentLap])
  const raceEnd = useMemo(() => {
    const lastTs = session.timestamps[session.timestamps.length - 1]
    return lastTs.ytSeconds + lastTs.lap.lapTime
  }, [session.timestamps])

  const outerStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 10 * scale,
    overflow: 'hidden',
  }), [scale])

  const bgStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    inset: 0,
    background: accent,
    opacity: 0.82,
  }), [accent])

  const wrapperStyle: React.CSSProperties = useMemo(() => ({
    position: 'relative',
    display: 'flex',
  }), [])

  if (showTimePanels) {
    return (
      <AbsoluteFill>
        <div style={outerStyle}>
          <div style={bgStyle} />
          <div style={wrapperStyle}>
            <PositionCounter
              timestamps={session.timestamps}
              currentLaps={session.laps}
              sessionAllLaps={sessionAllLaps}
              currentLap={currentLap}
              currentIdx={currentIdx}
              currentTime={currentTime}
              mode={mode}
              startingGridPosition={startingGridPosition}
              textColor={text}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="last"
                textColor={text}
              />
            </div>
            <LapTimerTrap
              timestamps={session.timestamps}
              lapColors={lapColors}
              currentLap={currentLap}
              currentIdx={currentIdx}
              currentTime={currentTime}
              raceEnd={raceEnd}
              textColor={timerTextColor ?? text}
              bgColor={timerBgColor}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel
                timestamps={session.timestamps}
                currentIdx={currentIdx}
                currentTime={currentTime}
                variant="best"
                textColor={text}
              />
            </div>
            <LapCounter
              timestamps={session.timestamps}
              currentLap={currentLap}
              currentTime={currentTime}
              textColor={text}
            />
          </div>
        </div>
      </AbsoluteFill>
    )
  }

  // Race layout
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 0, left: 0 }}>
        <PositionCounter
          timestamps={session.timestamps}
          currentLaps={session.laps}
          sessionAllLaps={sessionAllLaps}
          currentLap={currentLap}
          currentIdx={currentIdx}
          currentTime={currentTime}
          mode={mode}
          startingGridPosition={startingGridPosition}
          textColor={text}
        />
      </div>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
        <LapTimerTrap
          timestamps={session.timestamps}
          lapColors={lapColors}
          currentLap={currentLap}
          currentIdx={currentIdx}
          currentTime={currentTime}
          raceEnd={raceEnd}
          textColor={timerTextColor ?? text}
          bgColor={timerBgColor}
        />
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter
          timestamps={session.timestamps}
          currentLap={currentLap}
          currentTime={currentTime}
          textColor={text}
        />
      </div>
    </AbsoluteFill>
  )
}
