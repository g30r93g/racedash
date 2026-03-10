import React from 'react'
import { AbsoluteFill } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'
import { PositionCounter } from './PositionCounter'
import { TimeLabelPanel } from './TimeLabelPanel'

export const Geometric: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps, mode, startingGridPosition }) => {
  const lapColors = computeLapColors(session.laps, sessionAllLaps)
  const showTimePanels = mode === 'practice' || mode === 'qualifying'

  return (
    <AbsoluteFill>
      {/* Position counter: left-angle trapezium flush to top-left */}
      <div style={{ position: 'absolute', top: 0, left: 0 }}>
        <PositionCounter
          timestamps={session.timestamps}
          currentLaps={session.laps}
          sessionAllLaps={sessionAllLaps}
          fps={fps}
          mode={mode}
          startingGridPosition={startingGridPosition}
        />
      </div>
      {/* Center group: Last | LapTimer | Best — Last/Best only in practice/qualifying */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', display: 'flex' }}>
        {showTimePanels && (
          <TimeLabelPanel timestamps={session.timestamps} fps={fps} variant="last" />
        )}
        <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
        {showTimePanels && (
          <TimeLabelPanel timestamps={session.timestamps} fps={fps} variant="best" />
        )}
      </div>
      {/* Lap counter: right-angle trapezium flush to top-right */}
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter timestamps={session.timestamps} fps={fps} />
      </div>
    </AbsoluteFill>
  )
}
