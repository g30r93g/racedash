import React from 'react'
import { StopwatchIcon } from './StopwatchIcon'

interface TimePanelProps {
  iconBg: string
  label: string
  time: string
  labelColor: string
  sc: number
}

export const TimePanel = React.memo(function TimePanel({ iconBg, label, time, labelColor, sc }: TimePanelProps): React.ReactElement {
  const iconBgSize = 40 * sc
  const iconSize = 22 * sc

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 * sc }}>
      <div
        style={{
          width: iconBgSize,
          height: iconBgSize,
          background: iconBg,
          borderRadius: 6 * sc,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <StopwatchIcon size={iconSize} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 * sc }}>
        <span
          style={{
            fontSize: 10 * sc,
            fontWeight: 400,
            color: labelColor,
            letterSpacing: 1.5 * sc,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 26 * sc,
            fontWeight: 400,
            color: 'white',
            letterSpacing: 0.5 * sc,
            lineHeight: 1,
          }}
        >
          {time}
        </span>
      </div>
    </div>
  )
})
