import React from 'react'
import { AbsoluteFill } from 'remotion'
import type { OverlayProps } from '@racedash/core'
import { fontFamily } from '../../Root'
import { DeltaBadge } from '../../components/shared/DeltaBadge'
import { LapHistory } from '../../components/shared/LapHistory'
import { LapTimer } from '../../components/shared/LapTimer'

export const Gt7: React.FC<OverlayProps> = ({ session, fps }) => (
  <AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        bottom: 48,
        left: 48,
        fontFamily,
        padding: '20px 28px',
        minWidth: 320,
        color: 'white',
      }}
    >
      <LapTimer timestamps={session.timestamps} fps={fps} />
      <div
        style={{
          width: '100%',
          height: 1,
          background: 'rgba(255,255,255,0.15)',
          margin: '14px 0',
        }}
      />
      <LapHistory timestamps={session.timestamps} fps={fps} />
      <DeltaBadge timestamps={session.timestamps} fps={fps} />
    </div>
  </AbsoluteFill>
)
