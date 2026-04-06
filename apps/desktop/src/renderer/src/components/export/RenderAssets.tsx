import React from 'react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Info, Link2 } from 'lucide-react'
import type { ProjectData } from '../../../../../types/project'
import type { TimestampsResult } from '../../../../../types/ipc'
import type { RawLap, RawSegment } from '@/components/video/timeline/types'

export interface RenderAssetsSelection {
  /** When true, render the entire project — segment/lap selections are ignored. */
  entireProject: boolean
  /** Segment indices that are selected for export. */
  segments: Set<number>
  /** Lap keys (segmentIndex:lapNumber) that are selected for export. */
  laps: Set<string>
  /** Pairs of adjacent segment indices that are linked together. */
  linkedPairs: Set<string>
}

interface SegmentInfo {
  index: number
  label: string
  startSeconds: number
  endSeconds: number
  laps: Array<{ number: number; lapTime: number }>
  /** Index of the adjacent segment (if close enough to pair), or null. */
  adjacentTo: number | null
}

interface RenderAssetsProps {
  project: ProjectData
  timestampsResult?: TimestampsResult | null
  fps: number
  selection: RenderAssetsSelection
  onSelectionChange: (selection: RenderAssetsSelection) => void
  disabled?: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`
}

/** Max gap in seconds between two segments to offer pairing. */
const ADJACENT_GAP_THRESHOLD = 120

function buildSegmentInfos(
  project: ProjectData,
  timestampsResult: TimestampsResult | null | undefined,
  fps: number,
): SegmentInfo[] {
  const infos: SegmentInfo[] = project.segments.map((seg, i) => {
    const startSeconds = timestampsResult?.offsets[i] ?? (seg.videoOffsetFrame ?? 0) / fps
    const rawSeg = timestampsResult?.segments[i] as RawSegment | undefined
    const laps = (rawSeg?.selectedDriver?.laps as RawLap[] | undefined) ?? []
    const lastLap = laps[laps.length - 1]
    const endSeconds = lastLap ? startSeconds + lastLap.cumulative : startSeconds
    return {
      index: i,
      label: seg.label,
      startSeconds,
      endSeconds,
      laps: laps.map((l) => ({ number: l.number, lapTime: l.lapTime })),
      adjacentTo: null,
    }
  })

  for (let i = 0; i < infos.length - 1; i++) {
    const gap = infos[i + 1].startSeconds - infos[i].endSeconds
    if (gap >= 0 && gap < ADJACENT_GAP_THRESHOLD) {
      infos[i].adjacentTo = i + 1
      infos[i + 1].adjacentTo = i
    }
  }

  return infos
}

/** Build default selection with all linked pairs enabled. */
export function buildDefaultSelection(
  project: ProjectData,
  timestampsResult: TimestampsResult | null | undefined,
  fps: number,
): RenderAssetsSelection {
  const segments = new Set(project.segments.map((_, i) => i))
  const laps = new Set<string>()
  const linkedPairs = new Set<string>()

  const infos = buildSegmentInfos(project, timestampsResult, fps)
  for (const seg of infos) {
    for (const lap of seg.laps) {
      laps.add(`${seg.index}:${lap.number}`)
    }
    if (seg.adjacentTo !== null && seg.adjacentTo > seg.index) {
      linkedPairs.add(pairKey(seg.index, seg.adjacentTo))
    }
  }

  return { entireProject: true, segments, laps, linkedPairs }
}

export function RenderAssets({
  project,
  timestampsResult,
  fps,
  selection,
  onSelectionChange,
  disabled,
}: RenderAssetsProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)

  const segments = React.useMemo(
    () => buildSegmentInfos(project, timestampsResult, fps),
    [project, timestampsResult, fps],
  )

  const totalLaps = segments.reduce((sum, s) => sum + s.laps.length, 0)
  const selectedSegmentCount = selection.segments.size
  const selectedLapCount = selection.laps.size

  const toggleSegment = (index: number) => {
    const next = new Set(selection.segments)
    const seg = segments[index]

    if (next.has(index)) {
      next.delete(index)
      // If linked to a partner, deselect partner too
      if (seg.adjacentTo !== null && selection.linkedPairs.has(pairKey(index, seg.adjacentTo))) {
        next.delete(seg.adjacentTo)
      }
    } else {
      next.add(index)
      if (seg.adjacentTo !== null && selection.linkedPairs.has(pairKey(index, seg.adjacentTo))) {
        next.add(seg.adjacentTo)
      }
    }
    onSelectionChange({ ...selection, segments: next })
  }

  const toggleLink = (a: number, b: number) => {
    const key = pairKey(a, b)
    const nextLinked = new Set(selection.linkedPairs)
    if (nextLinked.has(key)) {
      nextLinked.delete(key)
    } else {
      nextLinked.add(key)
    }
    onSelectionChange({ ...selection, linkedPairs: nextLinked })
  }

  const toggleLap = (segmentIndex: number, lapNumber: number) => {
    const key = `${segmentIndex}:${lapNumber}`
    const nextLaps = new Set(selection.laps)
    if (nextLaps.has(key)) {
      nextLaps.delete(key)
    } else {
      nextLaps.add(key)
    }
    onSelectionChange({ ...selection, laps: nextLaps })
  }

  const toggleEntireProject = () => {
    onSelectionChange({ ...selection, entireProject: !selection.entireProject })
  }

  // Show laps for all segments (not just selected ones) — laps are independently selectable
  const segmentsWithLaps = segments.filter((s) => s.laps.length > 0)

  const summary = selection.entireProject
    ? 'Entire Project'
    : `${selectedSegmentCount}/${segments.length} segments · ${selectedLapCount}/${totalLaps} laps`

  return (
    <section>
      <SectionLabel>Render Assets</SectionLabel>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Collapsed summary card */}
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <span className="tabular-nums text-sm text-foreground">{summary}</span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              {open ? 'Close' : 'Configure'}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-2">
            {/* ENTIRE PROJECT */}
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-accent px-3 py-2 hover:bg-accent/80">
              <Checkbox
                checked={selection.entireProject}
                onCheckedChange={toggleEntireProject}
                disabled={disabled}
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">Entire Project</span>
                <span className="text-[10px] text-muted-foreground">Include the full video in the render</span>
              </div>
            </label>

            {/* SEGMENTS */}
            <div>
              <div className="mb-1.5 flex items-center gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Segments</span>
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <Info className="h-3 w-3 cursor-help text-muted-foreground/50" />
                  </HoverCardTrigger>
                  <HoverCardContent side="top" className="w-64 text-xs">
                    <p className="font-medium">Segment Selection</p>
                    <p className="mt-1 text-muted-foreground">
                      Choose which timing segments to include in the export. Deselected segments will have their video content included but no overlay graphics rendered for that portion.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Adjacent segments can be linked so they select together — useful when one session has multiple timing sources.
                    </p>
                  </HoverCardContent>
                </HoverCard>
              </div>
              <div className="rounded-md border border-border bg-accent">
                {segments.map((seg, i) => {
                  const isAdjacentDown = seg.adjacentTo !== null && seg.adjacentTo === i + 1
                  const isLinkedDown = isAdjacentDown && selection.linkedPairs.has(pairKey(seg.index, seg.adjacentTo!))
                  const isAdjacentUp = seg.adjacentTo !== null && seg.adjacentTo === i - 1
                  const isLinkedUp = isAdjacentUp && selection.linkedPairs.has(pairKey(seg.index, seg.adjacentTo!))
                  const canLink = isAdjacentDown || isAdjacentUp

                  return (
                    <React.Fragment key={seg.index}>
                      {i > 0 && !isLinkedUp && <div className="border-t border-border" />}
                      <div className="flex items-stretch">
                        {/* Link indicator column: line → icon → line */}
                        <div className="relative flex w-6 shrink-0 flex-col items-center">
                          {/* Top half of line */}
                          <div className={`w-px flex-1 ${isLinkedUp ? 'bg-primary' : 'bg-transparent'}`} />
                          {/* Link icon in the middle (only when part of a link) */}
                          {(isLinkedUp || isLinkedDown) ? (
                            <Link2 className="my-0.5 h-3 w-3 shrink-0 text-primary" />
                          ) : (
                            <div className="my-0.5 h-3 w-3 shrink-0" />
                          )}
                          {/* Bottom half of line */}
                          <div className={`w-px flex-1 ${isLinkedDown ? 'bg-primary' : 'bg-transparent'}`} />
                        </div>

                        {/* Segment row */}
                        <label className="flex flex-1 cursor-pointer items-center gap-2.5 py-2 pr-2 hover:bg-accent/80">
                          <Checkbox
                            checked={selection.segments.has(seg.index)}
                            onCheckedChange={() => toggleSegment(seg.index)}
                            disabled={disabled}
                          />
                          <div className="flex flex-1 flex-col">
                            <span className="text-xs font-medium text-foreground">{seg.label}</span>
                            <span className="text-[10px] text-muted-foreground">
                              <span className="tabular-nums">{formatTime(seg.startSeconds)} – {formatTime(seg.endSeconds)}</span> · {seg.laps.length} laps
                            </span>
                          </div>
                        </label>

                        {/* Link button */}
                        {canLink && isAdjacentDown && (
                          <button
                            className={`flex shrink-0 items-center px-2 text-[10px] transition-colors ${
                              isLinkedDown ? 'text-primary hover:text-primary/80' : 'text-muted-foreground/40 hover:text-muted-foreground'
                            }`}
                            onClick={() => toggleLink(seg.index, seg.adjacentTo!)}
                            disabled={disabled}
                            title={isLinkedDown ? 'Unlink segments' : 'Link segments'}
                          >
                            Link
                          </button>
                        )}
                        {/* Spacer for non-linkable rows to keep alignment */}
                        {!isAdjacentDown && <div className="w-[42px] shrink-0" />}
                      </div>
                    </React.Fragment>
                  )
                })}
              </div>
            </div>

            {/* LAPS — independently selectable regardless of segment selection */}
            {segmentsWithLaps.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Laps</span>
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <Info className="h-3 w-3 cursor-help text-muted-foreground/50" />
                    </HoverCardTrigger>
                    <HoverCardContent side="top" className="w-64 text-xs">
                      <p className="font-medium">Lap Selection</p>
                      <p className="mt-1 text-muted-foreground">
                        Choose which laps to show in the overlay. Deselected laps will be excluded from the timing graphics but their video content remains in the export.
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <div className="rounded-md border border-border bg-accent">
                  {segmentsWithLaps.map((seg, si) => {
                    const fastestTime = Math.min(...seg.laps.map((l) => l.lapTime))
                    return (
                      <React.Fragment key={seg.index}>
                        {si > 0 && <div className="border-t border-border" />}
                        {segmentsWithLaps.length > 1 && (
                          <div className="px-3 pt-2 pb-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{seg.label}</span>
                          </div>
                        )}
                        {seg.laps.map((lap, li) => {
                          const key = `${seg.index}:${lap.number}`
                          const isFastest = lap.lapTime === fastestTime
                          return (
                            <React.Fragment key={key}>
                              {(li > 0 || segmentsWithLaps.length > 1) && <div className="border-t border-border/50" />}
                              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-accent/80">
                                <Checkbox
                                  checked={selection.laps.has(key)}
                                  onCheckedChange={() => toggleLap(seg.index, lap.number)}
                                  disabled={disabled}
                                  className="h-3.5 w-3.5"
                                />
                                <div className="flex flex-1 items-center justify-between">
                                  <span className="text-[11px] text-foreground">Lap {lap.number}</span>
                                  <div className="flex items-center gap-1.5">
                                    {isFastest && (
                                      <Badge className="bg-purple-500/15 text-purple-400 hover:bg-purple-500/15 border-purple-500/30 px-1.5 py-0 text-[9px] font-medium">
                                        Fastest Lap
                                      </Badge>
                                    )}
                                    <span className={`tabular-nums text-[10px] ${isFastest ? 'text-purple-400' : 'text-muted-foreground'}`}>{formatLapTime(lap.lapTime)}</span>
                                  </div>
                                </div>
                              </label>
                            </React.Fragment>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
