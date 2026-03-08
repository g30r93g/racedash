import type { Lap, LapTimestamp } from '@racedash/core'

export function parseOffset(offsetStr: string): number {
  const parts = offsetStr.split(':')
  if (parts.length === 2) {
    const result = parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
    if (!isNaN(result)) return result
  } else if (parts.length === 3) {
    const result = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
    if (!isNaN(result)) return result
  }
  throw new Error(`Invalid offset '${offsetStr}'. Use H:MM:SS or M:SS.`)
}

export function calculateTimestamps(laps: Lap[], offsetSeconds: number): LapTimestamp[] {
  return laps.map(lap => ({
    lap,
    ytSeconds: Math.round((lap.cumulative - lap.lapTime + offsetSeconds) * 1000) / 1000,
  }))
}

export function formatYtTimestamp(seconds: number): string {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalS = Math.floor(totalMs / 1000)
  const m = Math.floor(totalS / 60)
  const s = totalS % 60
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function formatChapters(timestamps: LapTimestamp[]): string {
  if (!timestamps.length) return ''
  const ytStrs = timestamps.map(ts => formatYtTimestamp(ts.ytSeconds))
  const width = Math.max(...ytStrs.map(s => s.length))
  return timestamps
    .map(
      (ts, i) =>
        `${ytStrs[i].padStart(width)}   Lap ${String(ts.lap.number).padStart(2)}   ${formatLapTime(ts.lap.lapTime)}`,
    )
    .join('\n')
}
