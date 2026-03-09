import React from 'react'
import { AbsoluteFill } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { computeLapColors } from './lapColor'
import { LapTimerTrap } from './LapTimerTrap'

export const Geometric: React.FC<OverlayProps> = ({ session, sessionAllLaps, fps }) => {
  const lapColors = computeLapColors(session.laps, sessionAllLaps)

  return (
    <AbsoluteFill
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
      }}
    >
      <LapTimerTrap timestamps={session.timestamps} lapColors={lapColors} fps={fps} />
    </AbsoluteFill>
  )
}
