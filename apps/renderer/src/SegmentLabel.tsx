import React from 'react'
import { fontFamily } from './Root'

interface Props {
  label: string
  scale: number
}

/**
 * Renders a centered pill label (e.g. "Qualifying Start") over the overlay.
 * Intended to be placed inside an AbsoluteFill so it covers the full canvas.
 */
export const SegmentLabel: React.FC<Props> = ({ label, scale }) => (
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
    }}
  >
    <div
      style={{
        background: 'rgba(0, 0, 0, 0.72)',
        padding: `${12 * scale}px ${28 * scale}px`,
        borderRadius: 8 * scale,
        fontFamily,
        fontSize: 36 * scale,
        fontWeight: 700,
        color: 'white',
        letterSpacing: 2 * scale,
        textTransform: 'uppercase',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  </div>
)
