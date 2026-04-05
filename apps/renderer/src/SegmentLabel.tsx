import React from 'react'
import type { SegmentLabelStyling } from '@racedash/core'
import { fontFamily } from './Root'

interface Props {
  label: string
  scale: number
  styling?: SegmentLabelStyling
  opacity?: number
}

export const SegmentLabel: React.FC<Props> = ({ label, scale, styling, opacity = 1 }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      opacity,
    }}
  >
    <div
      style={{
        background: styling?.bgColor ?? 'rgba(0, 0, 0, 0.72)',
        padding: `${12 * scale}px ${28 * scale}px`,
        borderRadius: (styling?.borderRadius ?? 8) * scale,
        fontFamily,
        fontSize: 36 * scale,
        fontWeight: 700,
        color: styling?.textColor ?? 'white',
        letterSpacing: 2 * scale,
        textTransform: 'uppercase',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  </div>
)
