import React from 'react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, Link2 } from 'lucide-react'
import type { ProjectData } from '../../../../../types/project'
import type { TimestampsResult } from '../../../../../types/ipc'
import type { RawLap, RawSegment } from '@/components/video/timeline/types'

export interface RenderAssetsSelection {
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
  const s = (seconds % 60).toFixed(3)
  return m > 0 ? `${m}:${s.padStart(6, '0')}` : `${s}s`
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

  return { segments, laps, linkedPairs }
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

  // Show laps for all segments (not just selected ones) — laps are independently selectable
  const segmentsWithLaps = segments.filter((s) => s.laps.length > 0)

  return (
    <section>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-1">
          <SectionLabel className="mb-0">Render Assets</SectionLabel>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {selectedSegmentCount}/{segments.length} segments · {selectedLapCount}/{totalLaps} laps
            </span>
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-2">
            {/* SEGMENTS */}
            <div>
              <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Segments</span>
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
                              {formatTime(seg.startSeconds)} – {formatTime(seg.endSeconds)} · {seg.laps.length} laps
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
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Laps</span>
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
                                  <span className={`text-[11px] ${isFastest ? 'font-semibold text-purple-400' : 'text-foreground'}`}>
                                    Lap {lap.number}{isFastest ? ' ★' : ''}
                                  </span>
                                  <span className={`text-[10px] ${isFastest ? 'font-medium text-purple-400' : 'text-muted-foreground'}`}>
                                    {formatLapTime(lap.lapTime)}
                                  </span>
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
