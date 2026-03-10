import React from 'react'
import { AbsoluteFill } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'
import { LapCounter } from './LapCounter'

export const Geometric: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const lapColors = computeLapColors(session.laps, sessionAllLaps)

  return (
    <AbsoluteFill>
      {/* Lap timer: centered at top */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)' }}>
        <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
      </div>
      {/* Lap counter: right-angle trapezium flush to top-right */}
      <div style={{ position: 'absolute', top: 0, right: 0 }}>
        <LapCounter timestamps={session.timestamps} fps={fps} />
      </div>
    </AbsoluteFill>
  )
}
