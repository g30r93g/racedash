import { SectionLabel } from '@/components/shared/SectionLabel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import type { RawLap, RawSegment } from '@/components/video/timeline/types'
import { Check, Film, Info, Layers, Link2, Timer } from 'lucide-react'
import React from 'react'
import type { TimestampsResult } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'

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

export function buildDefaultSelection(
  project: ProjectData,
  timestampsResult: TimestampsResult | null | undefined,
  fps: number,
): RenderAssetsSelection {
  const linkedPairs = new Set<string>()
  const infos = buildSegmentInfos(project, timestampsResult, fps)
  for (const seg of infos) {
    if (seg.adjacentTo !== null && seg.adjacentTo > seg.index) {
      linkedPairs.add(pairKey(seg.index, seg.adjacentTo))
    }
  }
  return { entireProject: true, segments: new Set<number>(), laps: new Set<string>(), linkedPairs }
}

export function RenderAssets({
  project,
  timestampsResult,
  fps,
  selection,
  onSelectionChange,
  disabled,
}: RenderAssetsProps): React.ReactElement {
  const [modalOpen, setModalOpen] = React.useState(false)

  const segments = React.useMemo(
    () => buildSegmentInfos(project, timestampsResult, fps),
    [project, timestampsResult, fps],
  )

  const totalLaps = segments.reduce((sum, s) => sum + s.laps.length, 0)
  const selectedSegmentCount = selection.segments.size
  const selectedLapCount = selection.laps.size

  const selectedSegments = segments.filter((s) => selection.segments.has(s.index))

  // Build per-segment selected laps for the summary
  const selectedLapsBySegment = React.useMemo(() => {
    const map = new Map<number, number[]>()
    for (const key of selection.laps) {
      const [segIdx, lapNum] = key.split(':').map(Number)
      if (!map.has(segIdx)) map.set(segIdx, [])
      map.get(segIdx)!.push(lapNum)
    }
    // Sort lap numbers within each segment
    for (const laps of map.values()) laps.sort((a, b) => a - b)
    return map
  }, [selection.laps])

  // Find fastest lap per segment for badge display
  const fastestBySegment = React.useMemo(() => {
    const map = new Map<number, number>()
    for (const seg of segments) {
      if (seg.laps.length > 0) {
        const fastest = Math.min(...seg.laps.map((l) => l.lapTime))
        const fastestLap = seg.laps.find((l) => l.lapTime === fastest)
        if (fastestLap) map.set(seg.index, fastestLap.number)
      }
    }
    return map
  }, [segments])

  // Find the lap time for display
  const getLapTime = (segIndex: number, lapNum: number): string => {
    const seg = segments.find((s) => s.index === segIndex)
    const lap = seg?.laps.find((l) => l.number === lapNum)
    return lap ? formatLapTime(lap.lapTime) : ''
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <SectionLabel className="mb-0">Render Assets</SectionLabel>
        <Button variant="ghost" size="sm" onClick={() => setModalOpen(true)} disabled={disabled}>
          Configure
        </Button>
      </div>
      <div className="rounded-md border border-border bg-accent">
        {/* Video */}
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Film className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex flex-1 items-center justify-between">
            <span className="text-xs text-muted-foreground">Video</span>
            {selection.entireProject ? (
              <div className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-500" />
                <span className="text-xs text-foreground">Entire Project</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground/60">Segments only</span>
            )}
          </div>
        </div>

        {/* Segments */}
        <div className="border-t border-border" />
        <div className="px-3 py-2">
          <div className="flex items-center gap-2.5">
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Individual Segments</span>
            {selectedSegmentCount > 0 && (
              <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-[9px]">
                {selectedSegmentCount}/{segments.length}
              </Badge>
            )}
          </div>
          {selectedSegmentCount > 0 ? (
            <div className="mt-1.5 ml-6 flex flex-wrap gap-1">
              {selectedSegments.map((s) => (
                <Badge key={s.index} variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                  {s.label}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="mt-1 ml-6 block text-[10px] text-muted-foreground/50">None selected</span>
          )}
        </div>

        {/* Laps */}
        <div className="border-t border-border" />
        <div className="px-3 py-2">
          <div className="flex items-center gap-2.5">
            <Timer className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Individual Laps</span>
            {selectedLapCount > 0 && (
              <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-[9px]">
                {selectedLapCount}/{totalLaps}
              </Badge>
            )}
          </div>
          {selectedLapCount > 0 ? (
            <div className="mt-1.5 ml-6 flex flex-col gap-1.5">
              {segments.map((seg) => {
                const laps = selectedLapsBySegment.get(seg.index)
                if (!laps?.length) return null
                return (
                  <div key={seg.index}>
                    <span className="text-[10px] text-muted-foreground">{seg.label}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {laps.map((num) => {
                        const isFastest = fastestBySegment.get(seg.index) === num
                        return (
                          <Badge
                            key={num}
                            variant="outline"
                            className={`tabular-nums px-1.5 py-0 text-[10px] font-normal ${isFastest ? 'border-purple-500/30 bg-purple-500/10 text-purple-400' : ''}`}
                          >
                            L{num}
                            <span className="ml-1 text-[9px] text-muted-foreground">{getLapTime(seg.index, num)}</span>
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <span className="mt-1 ml-6 block text-[10px] text-muted-foreground/50">None selected</span>
          )}
        </div>
      </div>

      {/* Configuration modal */}
      <RenderAssetsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        segments={segments}
        totalLaps={totalLaps}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />
    </section>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function RenderAssetsModal({
  open,
  onOpenChange,
  segments,
  totalLaps,
  selection,
  onSelectionChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  segments: SegmentInfo[]
  totalLaps: number
  selection: RenderAssetsSelection
  onSelectionChange: (selection: RenderAssetsSelection) => void
}): React.ReactElement {
  const segmentsWithLaps = segments.filter((s) => s.laps.length > 0)

  const toggleEntireProject = () => {
    onSelectionChange({ ...selection, entireProject: !selection.entireProject })
  }

  const toggleSegment = (index: number) => {
    const next = new Set(selection.segments)
    const seg = segments[index]
    if (next.has(index)) {
      next.delete(index)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Render Assets</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          {/* ENTIRE PROJECT */}
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-accent px-3 py-2 hover:bg-accent/80">
            <Checkbox
              checked={selection.entireProject}
              onCheckedChange={toggleEntireProject}
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
                    Adjacent segments can be linked so they produce a single continuous overlay without a break in the graphics.
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

                return (
                  <React.Fragment key={seg.index}>
                    {i > 0 && !isLinkedUp && <div className="border-t border-border" />}
                    <div className="flex items-stretch">
                      {/* Link indicator column */}
                      <div className="relative flex w-6 shrink-0 flex-col items-center">
                        <div className={`w-px flex-1 ${isLinkedUp ? 'bg-primary' : 'bg-transparent'}`} />
                        {(isLinkedUp || isLinkedDown) ? (
                          <Link2 className="my-0.5 h-3 w-3 shrink-0 text-primary" />
                        ) : (
                          <div className="my-0.5 h-3 w-3 shrink-0" />
                        )}
                        <div className={`w-px flex-1 ${isLinkedDown ? 'bg-primary' : 'bg-transparent'}`} />
                      </div>

                      <label className="flex flex-1 cursor-pointer items-center gap-2.5 py-2 pr-2 hover:bg-accent/80">
                        <Checkbox
                          checked={selection.segments.has(seg.index)}
                          onCheckedChange={() => toggleSegment(seg.index)}
                        />
                        <div className="flex flex-1 flex-col">
                          <span className="text-xs font-medium text-foreground">{seg.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            <span className="tabular-nums">{formatTime(seg.startSeconds)} – {formatTime(seg.endSeconds)}</span> · {seg.laps.length} laps
                          </span>
                        </div>
                      </label>

                      {isAdjacentDown && (
                        <button
                          className={`flex shrink-0 items-center px-2 text-[10px] transition-colors ${
                            isLinkedDown ? 'text-primary hover:text-primary/80' : 'text-muted-foreground/40 hover:text-muted-foreground'
                          }`}
                          onClick={() => toggleLink(seg.index, seg.adjacentTo!)}
                          title={isLinkedDown ? 'Unlink segments' : 'Link segments'}
                        >
                          Link
                        </button>
                      )}
                      {!isAdjacentDown && <div className="w-[42px] shrink-0" />}
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          {/* LAPS */}
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
                                className="h-3.5 w-3.5"
                              />
                              <div className="flex flex-1 items-center justify-between">
                                <span className="text-[11px] text-foreground">Lap {lap.number}</span>
                                <div className="flex items-center gap-1.5">
                                  {isFastest && (
                                    <Badge className="border-purple-500/30 bg-purple-500/15 px-1.5 py-0 text-[9px] font-medium text-purple-400 hover:bg-purple-500/15">
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
      </DialogContent>
    </Dialog>
  )
}
