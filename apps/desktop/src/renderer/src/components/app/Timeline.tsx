import React from 'react'
import type { ProjectData } from '../../../../types/project'
import type { VideoInfo } from '../../../../types/ipc'
import { Button } from '@/components/ui/button'

interface TimelineProps {
  project: ProjectData
  videoInfo: VideoInfo | null
}

const SEGMENT_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444']
const LAP_COLOUR = '#3b82f6'
const POSITION_DOT_COLOURS = ['#f97316', '#ef4444', '#22c55e', '#eab308']

function formatRulerLabel(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function rulerTicks(duration: number): number[] {
  const interval = duration <= 60 ? 5 : duration <= 300 ? 30 : 60
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += interval) ticks.push(t)
  return ticks
}

export function Timeline({ project, videoInfo }: TimelineProps): React.ReactElement {
  const duration = videoInfo?.durationSeconds ?? 30
  const fps = videoInfo?.fps ?? 60
  const pct = (seconds: number) => `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`
  const widthPct = (seconds: number) => `${Math.min(100, (seconds / duration) * 100).toFixed(3)}%`

  const segmentSpans = project.segments.map((seg, i) => {
    const startSeconds = (seg.videoOffsetFrame ?? 0) / fps
    const nextFrame = project.segments[i + 1]?.videoOffsetFrame
    const endSeconds = nextFrame !== undefined ? nextFrame / fps : duration
    return { label: seg.label, startSeconds, endSeconds }
  })

  const placeholderLaps = [
    { label: 'L1', startSeconds: 0, endSeconds: duration * 0.32 },
    { label: 'L2', startSeconds: duration * 0.32, endSeconds: duration * 0.65 },
    { label: 'L3', startSeconds: duration * 0.65, endSeconds: duration },
  ]

  const ticks = rulerTicks(duration)

  return (
    <div className="flex h-[180px] shrink-0 flex-col border-t border-border bg-background" style={{ fontSize: 11 }}>
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium tracking-widest text-muted-foreground">TIMELINE</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Button size="icon" variant="outline" aria-label="Zoom out" className="h-5 w-5">−</Button>
          <Button size="icon" variant="outline" aria-label="Zoom in" className="h-5 w-5">+</Button>
        </div>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-5 shrink-0 items-end">
          <div className="w-20 shrink-0" aria-hidden="true" />
          <div className="relative flex-1">
            {ticks.map((t) => (
              <div key={t} className="absolute bottom-0 flex flex-col items-center" style={{ left: pct(t) }}>
                <span className="text-[10px] text-muted-foreground">{formatRulerLabel(t)}</span>
                <div className="h-1.5 w-px bg-border" />
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex flex-1 flex-col gap-px overflow-hidden">
          <TrackRow label="VIDEO">
            <div className="absolute inset-y-1 rounded-sm bg-[#3a3a3a]" style={{ left: '0%', width: '100%' }} />
          </TrackRow>

          <TrackRow label="SEGMENTS">
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
          </TrackRow>

          <TrackRow label="LAPS">
            {placeholderLaps.map((lap, i) => (
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
            ))}
          </TrackRow>

          <TrackRow label="POSITION">
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
          </TrackRow>

          <div
            className="pointer-events-none absolute inset-y-0 z-10 flex flex-col items-center"
            style={{ left: 'calc(5rem + 30%)' }}
          >
            <div className="rounded bg-primary px-1 py-px">
              <span className="font-mono text-[10px] text-primary-foreground">
                {formatRulerLabel(duration * 0.3)}
              </span>
            </div>
            <div className="w-px flex-1 bg-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-1 items-stretch">
      <div className="flex w-20 shrink-0 items-center border-r border-border px-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  )
}
