import React from 'react'
import type { LapListStyling, LapTimestamp } from '@racedash/core'
import { formatLapTime } from '@racedash/timestamps'

interface Props {
  timestamps: LapTimestamp[]
  currentIdx: number
  sessionBestTime: number | null
  scale: number
  styling?: LapListStyling
}

export const LapHistory: React.FC<Props> = ({ timestamps, currentIdx, sessionBestTime, scale, styling }) => {
  const maxRows = styling?.maxRows ?? 'all'
  const bgColor = styling?.bgColor ?? 'rgba(0,0,0,0.65)'
  const textColor = styling?.textColor ?? 'white'
  const bestLapColor = styling?.bestLapColor ?? '#00FF87'

  const completed = timestamps.slice(0, currentIdx)
  if (!completed.length) return null

  const visible = maxRows === 'all' ? completed : completed.slice(-maxRows)

  // Find session best lap time among completed laps
  let bestTime = sessionBestTime
  if (bestTime == null) {
    for (const ts of completed) {
      if (bestTime == null || ts.lap.lapTime < bestTime) bestTime = ts.lap.lapTime
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 6 * scale,
        overflow: 'hidden',
      }}
    >
      {visible.map((ts) => {
        const isBest = bestTime != null && ts.lap.lapTime === bestTime
        return (
          <div
            key={ts.lap.number}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 24 * scale,
              padding: `${4 * scale}px ${10 * scale}px`,
              background: bgColor,
              fontSize: 16 * scale,
              fontWeight: 500,
              color: isBest ? bestLapColor : textColor,
              // backdropFilter removed — no visual effect on transparent overlay, very expensive in Chromium
            }}
          >
            <span style={{ opacity: 0.6 }}>L{ts.lap.number}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatLapTime(ts.lap.lapTime)}</span>
          </div>
        )
      })}
    </div>
  )
}
