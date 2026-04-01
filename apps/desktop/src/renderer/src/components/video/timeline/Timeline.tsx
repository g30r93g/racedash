import { Button } from '@/components/ui/button'
import React, { useEffect, useRef, useState } from 'react'
import type { MultiVideoInfo, TimestampsResult, VideoInfo } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import type { Override } from '../../../screens/editor/tabs/TimingTab'
import { ZOOM_LEVELS, TRACK_LABELS, TRACK_PADDING_PX } from './types'
import { TimelineTracks } from './TimelineTracks'
import { Playhead } from './Playhead'

export interface TimelineProps {
  project: ProjectData
  videoInfo: VideoInfo | null
  multiVideoInfo?: MultiVideoInfo | null
  currentTime?: number
  timestampsResult?: TimestampsResult | null
  overrides?: Override[]
  onSeek?: (time: number) => void
}

export function Timeline({
  project,
  videoInfo,
  multiVideoInfo,
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
            <Playhead currentTime={currentTime} duration={duration} />
          </TimelineTracks>
        </div>
      </div>
    </div>
  )
}
