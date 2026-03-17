import { Button } from '@/components/ui/button'
import React, { useEffect, useRef, useState } from 'react'
import type { TimestampsResult, VideoInfo } from '../../../../types/ipc'
import type { ProjectData } from '../../../../types/project'

interface TimelineProps {
  project: ProjectData
  videoInfo: VideoInfo | null
  currentTime?: number
  timestampsResult?: TimestampsResult | null
}

const SEGMENT_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444']
const LAP_COLOUR = '#3b82f6'
const POSITION_DOT_COLOURS = ['#f97316', '#ef4444', '#22c55e', '#eab308']
const ZOOM_LEVELS = [1, 2, 4, 8, 16]
const TRACK_LABELS = ['VIDEO', 'SEGMENTS', 'LAPS', 'POSITION']

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
}

function deriveLapSpans(
  timestampsResult: TimestampsResult,
  segmentIndex: number,
  videoOffsetSeconds: number,
): LapSpan[] {
  const seg = timestampsResult.segments[segmentIndex]
  if (!seg?.selectedDriver) return []
  const laps = seg.selectedDriver.laps as Array<{ timeMs: number }>
  const spans: LapSpan[] = []
  let cursor = videoOffsetSeconds
  for (let i = 0; i < laps.length; i++) {
    const lapSeconds = laps[i].timeMs / 1000
    spans.push({ label: `L${i + 1}`, startSeconds: cursor, endSeconds: cursor + lapSeconds })
    cursor += lapSeconds
  }
  return spans
}

export function Timeline({ project, videoInfo, currentTime = 0, timestampsResult }: TimelineProps): React.ReactElement {
  const duration = videoInfo?.durationSeconds ?? 30
  const fps = videoInfo?.fps ?? 60
  const [zoomIdx, setZoomIdx] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIdx]
  const scrollRef = useRef<HTMLDivElement>(null)

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
    project.segments.forEach((seg, i) => {
      const videoOffsetSeconds = (seg.videoOffsetFrame ?? 0) / fps
      allSpans.push(...deriveLapSpans(timestampsResult, i, videoOffsetSeconds))
    })
    return allSpans
  }, [timestampsResult, project.segments, fps])

  const ticks = rulerTicks(duration, zoom)

  // Keep playhead in view as video plays
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const playheadPx = (currentTime / duration) * el.scrollWidth
    const { scrollLeft, clientWidth } = el
    if (playheadPx < scrollLeft || playheadPx > scrollLeft + clientWidth) {
      el.scrollLeft = playheadPx - clientWidth / 2
    }
  }, [currentTime, duration])

  // When zoom changes, keep currentTime centered
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = (currentTime / duration) * el.scrollWidth - el.clientWidth / 2
    })
  }, [zoom]) // intentionally excludes currentTime/duration — only re-center on zoom change

  return (
    <div className="flex h-45 shrink-0 flex-col border-t border-border bg-background" style={{ fontSize: 11 }}>
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium tracking-widest text-muted-foreground">TIMELINE</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{zoom}×</span>
          <Button
            size="icon" variant="outline" aria-label="Zoom out"
            className="h-5 w-5"
            disabled={zoomIdx === 0}
            onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
          >−</Button>
          <Button
            size="icon" variant="outline" aria-label="Zoom in"
            className="h-5 w-5"
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
          >+</Button>
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
          {/* Wide content — zoom * 100% of the scroll viewport */}
          <div className="flex h-full flex-col" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
            {/* Ruler */}
            <div className="relative h-5 shrink-0">
              {ticks.map((t) => (
                <div key={t} className="absolute bottom-0 flex flex-col items-center" style={{ left: pct(t) }}>
                  <span className="text-[10px] text-muted-foreground">{formatRulerLabel(t)}</span>
                  <div className="h-1.5 w-px bg-border" />
                </div>
              ))}
            </div>

            {/* Track rows */}
            <div className="relative flex flex-1 flex-col gap-px overflow-hidden">
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
                      className="absolute inset-y-1 flex items-center overflow-hidden rounded-sm px-1"
                      style={{
                        left: pct(seg.startSeconds),
                        width: widthPct(seg.endSeconds - seg.startSeconds),
                        backgroundColor: SEGMENT_COLOURS[i % SEGMENT_COLOURS.length],
                      }}
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
                      className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-full px-1"
                      style={{
                        left: pct(lap.startSeconds),
                        width: widthPct(lap.endSeconds - lap.startSeconds),
                        backgroundColor: LAP_COLOUR,
                      }}
                    >
                      <span className="text-[10px] font-medium text-white">{lap.label}</span>
                    </div>
                  ))
                )}
              </div>

              {/* POSITION */}
              <div className="relative flex-1">
                {POSITION_DOT_COLOURS.map((colour, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                    style={{
                      left: pct((duration / (POSITION_DOT_COLOURS.length + 1)) * (i + 1)),
                      backgroundColor: colour,
                    }}
                  />
                ))}
              </div>

              {/* Playhead */}
              <div
                className="pointer-events-none absolute inset-y-0 z-10 flex flex-col items-center"
                style={{ left: pct(currentTime) }}
              >
                <div className="rounded bg-primary px-1 py-px">
                  <span className="font-mono text-[10px] text-primary-foreground">
                    {formatRulerLabel(currentTime)}
                  </span>
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
