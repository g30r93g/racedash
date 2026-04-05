import { Button } from '@/components/ui/button'
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MultiVideoInfo, TimestampsResult, VideoInfo } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import type { Override } from '../../../screens/editor/tabs/TimingTab'
import { ZOOM_LEVELS, TRACK_LABELS, TRACK_PADDING_PX, formatRulerLabel, pct } from './types'
import { TimelineTracks } from './TimelineTracks'

export interface TimelineHandle {
  /** Update playhead position without triggering a React re-render. */
  seek: (time: number) => void
}

export interface TimelineProps {
  project: ProjectData
  videoInfo: VideoInfo | null
  multiVideoInfo?: MultiVideoInfo | null
  timestampsResult?: TimestampsResult | null
  overrides?: Override[]
  onSeek?: (time: number) => void
}

export const Timeline = React.forwardRef<TimelineHandle, TimelineProps>(function Timeline(
  { project, videoInfo, multiVideoInfo, timestampsResult, overrides = [], onSeek },
  ref,
) {
  const duration = videoInfo?.durationSeconds ?? 30
  const fps = videoInfo?.fps ?? 60
  const [zoomIdx, setZoomIdx] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIdx]
  const scrollRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const currentTimeRef = useRef(0)

  const updatePlayhead = useCallback(
    (time: number) => {
      currentTimeRef.current = time
      const head = playheadRef.current
      if (head) {
        head.style.left = pct(time, duration)
        const label = head.querySelector('[data-playhead-label]') as HTMLSpanElement | null
        if (label) label.textContent = formatRulerLabel(time)
      }
      const el = scrollRef.current
      if (el) {
        const px = TRACK_PADDING_PX + (time / duration) * (el.scrollWidth - 2 * TRACK_PADDING_PX)
        el.scrollLeft = px - el.clientWidth * 0.3
      }
    },
    [duration],
  )

  useImperativeHandle(ref, () => ({ seek: updatePlayhead }), [updatePlayhead])

  // When zoom changes, keep playhead centered
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      const px =
        TRACK_PADDING_PX + (currentTimeRef.current / duration) * (el.scrollWidth - 2 * TRACK_PADDING_PX)
      el.scrollLeft = px - el.clientWidth / 2
    })
  }, [zoom, duration])

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
          <TimelineTracks
            project={project}
            duration={duration}
            fps={fps}
            zoom={zoom}
            multiVideoInfo={multiVideoInfo}
            timestampsResult={timestampsResult}
            overrides={overrides}
            onSeek={onSeek}
          >
            {/* Playhead — positioned imperatively via ref, zero React re-renders */}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute inset-y-0 z-10 -translate-x-1/2 flex flex-col items-center"
              style={{ left: '0%' }}
            >
              <div className="rounded bg-primary px-1 py-px">
                <span data-playhead-label className="font-mono text-[10px] text-primary-foreground">
                  {formatRulerLabel(0)}
                </span>
              </div>
              <div className="w-px flex-1 bg-primary" />
            </div>
          </TimelineTracks>
        </div>
      </div>
    </div>
  )
})
