import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { MultiVideoInfo, TimestampsResult, VideoInfo } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import type { Override } from '../../../screens/editor/tabs/TimingTab'
import type { Boundary, CutRegion, Transition } from '../../../../../types/videoEditing'
import { ZOOM_LEVELS, TRACK_LABELS, TRACK_PADDING_PX, formatRulerLabel, pct } from './types'
import { TimelineTracks } from './TimelineTracks'
import { computeKeptRanges, toOutputFrame } from '../../../lib/videoEditing'

export type TimelineViewMode = 'source' | 'project'

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
  cutRegions?: CutRegion[]
  onCutClick?: (cut: CutRegion) => void
  onCutUpdate?: (updated: CutRegion) => void
  onSeek?: (time: number) => void
  viewMode?: TimelineViewMode
  onViewModeChange?: (mode: TimelineViewMode) => void
  boundaries?: Boundary[]
  transitions?: Transition[]
  onAddTransition?: (boundaryId: string, type: import('../../../../../types/videoEditing').TransitionType) => void
  onTransitionUpdate?: (updated: Transition) => void
  onTransitionDelete?: (id: string) => void
}

export const Timeline = React.forwardRef<TimelineHandle, TimelineProps>(function Timeline(
  { project, videoInfo, multiVideoInfo, timestampsResult, overrides = [], cutRegions, onCutClick, onCutUpdate, onSeek, viewMode, onViewModeChange, boundaries, transitions, onAddTransition, onTransitionUpdate, onTransitionDelete },
  ref,
) {
  const duration = videoInfo?.durationSeconds ?? 30
  const fps = videoInfo?.fps ?? 60
  const totalFrames = Math.ceil(duration * fps)

  // In Project view, compute output duration and time-mapping function
  const isProjectView = viewMode === 'project'
  const displayDuration = useMemo(() => {
    if (!isProjectView || !cutRegions?.length) return duration
    const keptRanges = computeKeptRanges(totalFrames, cutRegions)
    return keptRanges.reduce((sum, r) => sum + (r.endFrame - r.startFrame), 0) / fps
  }, [isProjectView, cutRegions, totalFrames, fps, duration])

  const mapTime = useCallback(
    (sourceSeconds: number) => {
      if (!isProjectView || !cutRegions?.length) return sourceSeconds
      const sourceFrame = Math.round(sourceSeconds * fps)
      return toOutputFrame(sourceFrame, cutRegions, [], fps) / fps
    },
    [isProjectView, cutRegions, fps],
  )

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
        head.style.left = pct(time, displayDuration)
        const label = head.querySelector('[data-playhead-label]') as HTMLSpanElement | null
        if (label) label.textContent = formatRulerLabel(time)
      }
      const el = scrollRef.current
      if (el) {
        const px = TRACK_PADDING_PX + (time / displayDuration) * (el.scrollWidth - 2 * TRACK_PADDING_PX)
        el.scrollLeft = px - el.clientWidth * 0.3
      }
    },
    [displayDuration],
  )

  useImperativeHandle(ref, () => ({ seek: updatePlayhead }), [updatePlayhead])

  // When zoom changes, keep playhead centered
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      const px =
        TRACK_PADDING_PX + (currentTimeRef.current / displayDuration) * (el.scrollWidth - 2 * TRACK_PADDING_PX)
      el.scrollLeft = px - el.clientWidth / 2
    })
  }, [zoom, duration])

  return (
    <div className="flex h-45 shrink-0 flex-col border-t border-border bg-background" style={{ fontSize: 11 }}>
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-widest text-muted-foreground">TIMELINE</span>
          {onViewModeChange && (
            <Tabs value={viewMode ?? 'source'} onValueChange={(v) => onViewModeChange(v as TimelineViewMode)}>
              <TabsList className="h-6">
                <TabsTrigger value="source" className="h-5 px-2 text-[10px]">Source</TabsTrigger>
                <TabsTrigger value="project" className="h-5 px-2 text-[10px]">Project</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
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
            cutRegions={cutRegions}
            viewMode={viewMode}
            mapTime={mapTime}
            displayDuration={displayDuration}
            onCutClick={onCutClick}
            onCutUpdate={onCutUpdate}
            onSeek={onSeek}
            boundaries={boundaries}
            transitions={transitions}
            onAddTransition={onAddTransition}
            onTransitionUpdate={onTransitionUpdate}
            onTransitionDelete={onTransitionDelete}
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
