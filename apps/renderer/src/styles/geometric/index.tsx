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

  if (showTimePanels) {
    // Practice/qualifying: full-width banner — all panels in one flex row with no gaps
    return (
      <AbsoluteFill>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex' }}>
          <PositionCounter
            timestamps={session.timestamps}
            currentLaps={session.laps}
            sessionAllLaps={sessionAllLaps}
            fps={fps}
            mode={mode}
            startingGridPosition={startingGridPosition}
          />
          <div style={{ flex: 1 }}>
            <TimeLabelPanel timestamps={session.timestamps} fps={fps} variant="last" />
          </div>
          <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
          <div style={{ flex: 1 }}>
            <TimeLabelPanel timestamps={session.timestamps} fps={fps} variant="best" />
          </div>
          <LapCounter timestamps={session.timestamps} fps={fps} />
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
        />
      </div>
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
        <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter timestamps={session.timestamps} fps={fps} />
      </div>
    </AbsoluteFill>
  )
}
