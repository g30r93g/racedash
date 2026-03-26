import type { Lap, LapTimestamp } from '@racedash/core'

export function parseOffset(offsetStr: string, fps?: number): number {
  const trimmed = offsetStr.trim()

  const frameMatch = trimmed.match(/^(\d+)\s*f$/i)
  if (frameMatch) {
    if (fps == null || !Number.isFinite(fps) || fps <= 0) {
      throw new Error(`Invalid offset '${offsetStr}'. Frame offsets require a positive fps.`)
    }
    return parseInt(frameMatch[1], 10) / fps
  }

  const timestampMatch = trimmed.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/)
  if (timestampMatch) {
    const [, hoursStr, minutesStr, secondsStr] = timestampMatch
    const hours = hoursStr == null ? 0 : parseInt(hoursStr, 10)
    const minutes = parseInt(minutesStr, 10)
    const seconds = parseFloat(secondsStr)
    return hours * 3600 + minutes * 60 + seconds
  }

  throw new Error(`Invalid offset '${offsetStr}'. Use H:MM:SS(.sss), M:SS(.sss), or '<frames> F'.`)
}

export function calculateTimestamps(laps: Lap[], offsetSeconds: number): LapTimestamp[] {
  return laps.map((lap) => ({
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
  const ytStrs = timestamps.map((ts) => formatYtTimestamp(ts.ytSeconds))
  const width = Math.max(...ytStrs.map((s) => s.length))
  return timestamps
    .map(
      (ts, i) =>
        `${ytStrs[i].padStart(width)}   Lap ${String(ts.lap.number).padStart(2)}   ${formatLapTime(ts.lap.lapTime)}`,
    )
    .join('\n')
}
