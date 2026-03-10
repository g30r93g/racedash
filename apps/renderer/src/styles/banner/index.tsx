import React, { useMemo } from 'react'
import { AbsoluteFill, useVideoConfig } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'
import { PositionCounter } from './PositionCounter'
import { TimeLabelPanel } from './TimeLabelPanel'

const DEFAULT_ACCENT = '#3DD73D'

export const Banner: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps, mode, startingGridPosition, accentColor, textColor, timerTextColor, timerBgColor }) => {
  const { width } = useVideoConfig()
  const scale = width / 1920
  const lapColors = useMemo(() => computeLapColors(session.laps, sessionAllLaps), [session.laps, sessionAllLaps])
  const showTimePanels = mode === 'practice' || mode === 'qualifying'
  const accent = useMemo(() => accentColor ?? DEFAULT_ACCENT, [accentColor])
  const text = useMemo(() => textColor ?? 'white', [textColor])

  // Outer clip — no background here so only the content layer gets rounded corners
  const outerStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: 10 * scale,
    overflow: 'hidden',
  }), [scale])

  // Semi-transparent accent fill behind the content (opacity doesn't bleed onto text)
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
              fps={fps}
              mode={mode}
              startingGridPosition={startingGridPosition}
              textColor={text}
            />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel timestamps={session.timestamps} fps={fps} variant="last" textColor={text} />
            </div>
            <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} textColor={timerTextColor ?? text} bgColor={timerBgColor} />
            <div style={{ flex: 1 }}>
              <TimeLabelPanel timestamps={session.timestamps} fps={fps} variant="best" textColor={text} />
            </div>
            <LapCounter timestamps={session.timestamps} fps={fps} textColor={text} />
          </div>
        </div>
      </AbsoluteFill>
    )
  }

  // Race: fixed-size panels anchored to edges with the lap timer centered
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 0, left: 0 }}>
        <PositionCounter
          timestamps={session.timestamps}
          currentLaps={session.laps}
          sessionAllLaps={sessionAllLaps}
          fps={fps}
          mode={mode}
          startingGridPosition={startingGridPosition}
          textColor={text}
        />
      </div>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
        <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} textColor={timerTextColor ?? text} bgColor={timerBgColor} />
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter timestamps={session.timestamps} fps={fps} textColor={text} />
      </div>
    </AbsoluteFill>
  )
}
