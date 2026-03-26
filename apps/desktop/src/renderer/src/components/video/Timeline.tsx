import { Button } from '@/components/ui/button'
import React, { useEffect, useRef, useState } from 'react'
import type { TimestampsResult, VideoInfo } from '../../../../types/ipc'
import type { ProjectData } from '../../../../types/project'
import type { Override } from '../../screens/editor/tabs/TimingTab'

interface TimelineProps {
  project: ProjectData
  videoInfo: VideoInfo | null
  currentTime?: number
  timestampsResult?: TimestampsResult | null
  overrides?: Override[]
  onSeek?: (time: number) => void
}

const SEGMENT_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444']
const LAP_COLOUR = '#3b82f6'
const ZOOM_LEVELS = [1, 2, 4, 8, 16]
const TRACK_LABELS = ['VIDEO', 'SEGMENTS', 'LAPS', 'POSITION']
// Half the playhead label width — gives the label room at t=0 and t=duration
const TRACK_PADDING_PX = 16

function formatRulerLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function rulerTicks(duration: number, zoom: number): number[] {
  const visibleDuration = duration / zoom
  const interval = visibleDuration <= 30 ? 5 : visibleDuration <= 120 ? 15 : visibleDuration <= 300 ? 30 : 60
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += interval) ticks.push(t)
  return ticks
}

interface LapSpan {
  label: string
  startSeconds: number
  endSeconds: number
  fastest: boolean
}

interface PositionDot {
  videoSeconds: number
  position: number
  direction: 'up' | 'down' | null
  kind: 'replay' | 'override'
}

type RawLap = { number: number; lapTime: number; cumulative: number }
type RawReplayEntry = { kart: string; position: number; totalSeconds: number | null }
type RawSegment = {
  selectedDriver?: { kart: string; name: string; laps: unknown[] }
  replayData?: RawReplayEntry[][]
  capabilities?: Record<string, boolean>
}

function deriveLapSpans(seg: RawSegment, offsetSeconds: number): LapSpan[] {
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

function derivePositionDots(seg: RawSegment, offsetSeconds: number): Omit<PositionDot, 'direction'>[] {
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

function positionDotColor(direction: 'up' | 'down' | null): string {
  if (direction === 'up') return '#22c55e'
  if (direction === 'down') return '#ef4444'
  return '#6b7280'
}

export function Timeline({
  project,
  videoInfo,
  currentTime = 0,
  timestampsResult,
  overrides = [],
  onSeek,
}: TimelineProps): React.ReactElement {
  const duration = videoInfo?.durationSeconds ?? 30
  const fps = videoInfo?.fps ?? 60
  const [zoomIdx, setZoomIdx] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIdx]
  const scrollRef = useRef<HTMLDivElement>(null)

  // pct/widthPct produce % values for positioning within the padded content area
  const pct = (seconds: number) => `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`
  const widthPct = (seconds: number) => `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`

  const segmentSpans = project.segments.map((seg, i) => {
    const startSeconds = (seg.videoOffsetFrame ?? 0) / fps
    const nextFrame = project.segments[i + 1]?.videoOffsetFrame
    const endSeconds = nextFrame !== undefined ? nextFrame / fps : duration
    return { label: seg.label, startSeconds, endSeconds }
  })

  const lapSpans: LapSpan[] = React.useMemo(() => {
    if (!timestampsResult) return []
    const allSpans: LapSpan[] = []
    timestampsResult.segments.forEach((seg, i) => {
      const offsetSeconds = timestampsResult.offsets[i] ?? 0
      allSpans.push(...deriveLapSpans(seg as RawSegment, offsetSeconds))
    })
    return allSpans
  }, [timestampsResult])

  const rawReplayDots = React.useMemo(() => {
    if (!timestampsResult) return []
    const all: Omit<PositionDot, 'direction'>[] = []
    timestampsResult.segments.forEach((seg, i) => {
      const offsetSeconds = timestampsResult.offsets[i] ?? 0
      all.push(...derivePositionDots(seg as RawSegment, offsetSeconds))
    })
    return all
  }, [timestampsResult])

  const { positionDots, overrideDots } = React.useMemo(() => {
    // Parse overrides into raw dots
    const rawOverrides: Omit<PositionDot, 'direction'>[] = overrides.flatMap((o) => {
      const frameMatch = o.timecode.match(/^(\d+)\s*F$/i)
      const videoSeconds = frameMatch ? parseInt(frameMatch[1], 10) / fps : null
      if (videoSeconds === null) return []
      const posMatch = o.position.match(/^P?(\d+)$/i)
      const position = posMatch ? parseInt(posMatch[1], 10) : null
      if (position === null) return []
      return [{ videoSeconds, position, kind: 'override' as const }]
    })

    // Derive grid (Lap 0) position as the direction seed
    let gridPosition: number | null = null
    for (const seg of timestampsResult?.segments ?? []) {
      const s = seg as RawSegment
      if (!s.selectedDriver || !s.replayData?.[0]) continue
      const entry = s.replayData[0].find((e) => e.kart === s.selectedDriver!.kart)
      if (entry) {
        gridPosition = entry.position
        break
      }
    }

    // Merge, sort by time, compute direction across the unified sequence
    const merged = [...rawReplayDots, ...rawOverrides].sort((a, b) => a.videoSeconds - b.videoSeconds)
    let prev: number | null = gridPosition
    const withDirection: PositionDot[] = merged.map((dot) => {
      const direction = prev == null ? null : dot.position < prev ? 'up' : dot.position > prev ? 'down' : null
      prev = dot.position
      return { ...dot, direction }
    })

    return {
      positionDots: withDirection.filter((d) => d.kind === 'replay'),
      overrideDots: withDirection.filter((d) => d.kind === 'override'),
    }
  }, [rawReplayDots, overrides, fps, timestampsResult])

  const gridLines = React.useMemo(() => {
    const lines: { t: number; major: boolean }[] = []
    for (let t = 5; t < duration; t += 5) {
      lines.push({ t, major: t % 15 === 0 })
    }
    return lines
  }, [duration])

  const ticks = rulerTicks(duration, zoom)

  // Pixel position of the playhead within the scrollable area, accounting for padding
  const playheadPx = (el: HTMLDivElement) =>
    TRACK_PADDING_PX + (currentTime / duration) * (el.scrollWidth - 2 * TRACK_PADDING_PX)

  // Keep playhead at 30% from the left while playing
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = playheadPx(el) - el.clientWidth * 0.3
  }, [currentTime, duration]) // eslint-disable-line react-hooks/exhaustive-deps -- playheadPx closes over currentTime/duration already in deps

  // When zoom changes, keep currentTime centered
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = playheadPx(el) - el.clientWidth / 2
    })
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally excludes currentTime/duration, only re-centre on zoom change

  return (
    <div className="flex h-45 shrink-0 flex-col border-t border-border bg-background" style={{ fontSize: 11 }}>
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium tracking-widest text-muted-foreground">TIMELINE</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{zoom}×</span>
          <Button
            size="icon"
            variant="outline"
            aria-label="Zoom out"
            className="h-5 w-5"
            disabled={zoomIdx === 0}
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
          >
            −
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label="Zoom in"
            className="h-5 w-5"
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
          >
            +
          </Button>
        </div>
      </div>

      {/* Body: fixed label column + scrollable track area */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Fixed label column */}
        <div className="flex w-20 shrink-0 flex-col border-r border-border">
          <div className="h-5 shrink-0" />
          {TRACK_LABELS.map((label) => (
            <div key={label} className="flex flex-1 items-center px-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Horizontally scrollable track content */}
        <div ref={scrollRef} className="relative flex-1 overflow-x-auto overflow-y-hidden">
          {/* Wide content — zoom * 100% of the scroll viewport, padded on each end */}
          <div
            className="flex h-full flex-col"
            style={{
              width: `${zoom * 100}%`,
              minWidth: '100%',
              paddingLeft: TRACK_PADDING_PX,
              paddingRight: TRACK_PADDING_PX,
            }}
          >
            {/* Ruler */}
            <div className="relative h-5 shrink-0">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center"
                  style={{ left: pct(t) }}
                >
                  <span className="text-[10px] text-muted-foreground">{formatRulerLabel(t)}</span>
                  <div className="h-1.5 w-px bg-border" />
                </div>
              ))}
            </div>

            {/* Track rows */}
            <div className="relative flex flex-1 flex-col gap-px overflow-hidden">
              {/* Grid lines — behind all track content */}
              {gridLines.map(({ t, major }) => (
                <div
                  key={t}
                  className="pointer-events-none absolute inset-y-0"
                  style={{
                    left: pct(t),
                    width: major ? 1.5 : 1,
                    backgroundColor: major ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                  }}
                />
              ))}

              {/* VIDEO */}
              <div className="relative flex-1">
                <div className="absolute inset-y-1 rounded-sm bg-[#3a3a3a]" style={{ left: '0%', width: '100%' }} />
              </div>

              {/* SEGMENTS */}
              <div className="relative flex-1">
                {segmentSpans.length === 0 ? (
                  <div className="absolute inset-y-2 left-0 right-0 rounded-sm border border-dashed border-border" />
                ) : (
                  segmentSpans.map((seg, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-1 flex items-center overflow-hidden rounded-sm px-1 cursor-pointer transition-[filter] duration-150 hover:brightness-110 active:brightness-90"
                      style={{
                        left: pct(seg.startSeconds),
                        width: widthPct(seg.endSeconds - seg.startSeconds),
                        backgroundColor: SEGMENT_COLOURS[i % SEGMENT_COLOURS.length],
                      }}
                      onClick={() => onSeek?.(seg.startSeconds)}
                    >
                      <span className="truncate text-[10px] font-medium text-white">{seg.label}</span>
                    </div>
                  ))
                )}
              </div>

              {/* LAPS */}
              <div className="relative flex-1">
                {lapSpans.length === 0 ? (
                  <div className="absolute inset-y-2 left-0 right-0 rounded-sm border border-dashed border-border" />
                ) : (
                  lapSpans.map((lap, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-full px-1 cursor-pointer transition-[filter] duration-150 hover:brightness-110 active:brightness-90"
                      style={{
                        left: pct(lap.startSeconds),
                        width: widthPct(lap.endSeconds - lap.startSeconds),
                        backgroundColor: lap.fastest ? 'var(--lap-fastest)' : LAP_COLOUR,
                      }}
                      onClick={() => onSeek?.(lap.startSeconds)}
                    >
                      <span className="text-[10px] font-medium text-white">{lap.label}</span>
                    </div>
                  ))
                )}
              </div>

              {/* POSITION */}
              <div className="relative flex-1">
                {positionDots.length === 0 && overrideDots.length === 0 ? (
                  <div className="absolute inset-y-2 left-0 right-0 rounded-sm border border-dashed border-border" />
                ) : (
                  <>
                    {positionDots.map((dot, i) => (
                      <div
                        key={i}
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer hover:scale-125 active:scale-110 transition-transform"
                        style={{
                          left: pct(dot.videoSeconds),
                          backgroundColor: positionDotColor(dot.direction),
                        }}
                        onClick={() => onSeek?.(dot.videoSeconds)}
                      />
                    ))}
                    {overrideDots.map((dot, i) => (
                      <div
                        key={`override-${i}`}
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-pointer hover:scale-125 active:scale-110 transition-transform"
                        style={{
                          left: pct(dot.videoSeconds),
                          backgroundColor: positionDotColor(dot.direction),
                        }}
                        onClick={() => onSeek?.(dot.videoSeconds)}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Playhead */}
              <div
                className="pointer-events-none absolute inset-y-0 z-10 -translate-x-1/2 flex flex-col items-center"
                style={{ left: pct(currentTime) }}
              >
                <div className="rounded bg-primary px-1 py-px">
                  <span className="font-mono text-[10px] text-primary-foreground">{formatRulerLabel(currentTime)}</span>
                </div>
                <div className="w-px flex-1 bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
