export const SEGMENT_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444']
export const LAP_COLOUR = '#3b82f6'
export const ZOOM_LEVELS = [1, 2, 4, 8, 16]
export const TRACK_LABELS = ['VIDEO', 'SEGMENTS', 'LAPS', 'POSITION']
// Half the playhead label width — gives the label room at t=0 and t=duration
export const TRACK_PADDING_PX = 16

export function pct(seconds: number, duration: number): string {
  return `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`
}

export function formatRulerLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function rulerTicks(duration: number, zoom: number): number[] {
  const visibleDuration = duration / zoom
  const interval = visibleDuration <= 30 ? 5 : visibleDuration <= 120 ? 15 : visibleDuration <= 300 ? 30 : 60
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += interval) ticks.push(t)
  return ticks
}

export interface LapSpan {
  label: string
  startSeconds: number
  endSeconds: number
  fastest: boolean
}

export interface PositionDot {
  videoSeconds: number
  position: number
  direction: 'up' | 'down' | null
  kind: 'replay' | 'override'
}

export type RawLap = { number: number; lapTime: number; cumulative: number }
export type RawReplayEntry = { kart: string; position: number; totalSeconds: number | null }
export type RawSegment = {
  selectedDriver?: { kart: string; name: string; laps: unknown[] }
  replayData?: RawReplayEntry[][]
  capabilities?: Record<string, boolean>
}

export function deriveLapSpans(seg: RawSegment, offsetSeconds: number): LapSpan[] {
  if (!seg.selectedDriver) return []
  const laps = seg.selectedDriver.laps as RawLap[]
  const fastestTime = Math.min(...laps.map((l) => l.lapTime))
  return laps.map((lap) => ({
    label: `L${lap.number}`,
    startSeconds: lap.cumulative - lap.lapTime + offsetSeconds,
    endSeconds: lap.cumulative + offsetSeconds,
    fastest: lap.lapTime === fastestTime,
  }))
}

export function derivePositionDots(seg: RawSegment, offsetSeconds: number): Omit<PositionDot, 'direction'>[] {
  if (!seg.selectedDriver || !seg.replayData) return []
  const { replayData, selectedDriver } = seg
  const dots: Omit<PositionDot, 'direction'>[] = []
  let prevPosition: number | null = null
  for (let i = 1; i < replayData.length; i++) {
    const snapshot = replayData[i]
    const p1 = snapshot.find((e) => e.position === 1)
    if (!p1 || p1.totalSeconds === null) continue
    const videoSeconds = offsetSeconds + p1.totalSeconds
    const entry = snapshot.find((e) => e.kart === selectedDriver.kart)
    if (!entry) continue
    if (entry.position !== prevPosition) {
      dots.push({ videoSeconds, position: entry.position, kind: 'replay' })
      prevPosition = entry.position
    }
  }
  return dots
}

export function positionDotColor(direction: 'up' | 'down' | null): string {
  if (direction === 'up') return '#22c55e'
  if (direction === 'down') return '#ef4444'
  return '#6b7280'
}
