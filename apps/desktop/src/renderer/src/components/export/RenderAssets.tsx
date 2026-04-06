import React from 'react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Checkbox } from '@/components/ui/checkbox'
import { Link2 } from 'lucide-react'
import type { ProjectData } from '../../../../../types/project'
import type { TimestampsResult } from '../../../../../types/ipc'
import type { RawLap, RawSegment } from '@/components/video/timeline/types'

export interface RenderAssetsSelection {
  /** Segment indices that are selected for export. */
  segments: Set<number>
  /** Lap keys (segmentIndex:lapNumber) that are selected for export. */
  laps: Set<string>
}

interface SegmentInfo {
  index: number
  label: string
  startSeconds: number
  endSeconds: number
  laps: Array<{ number: number; lapTime: number }>
  /** Index of the paired segment (if adjacent and can form a session), or null. */
  pairedWith: number | null
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

/** Max gap in seconds between two segments to consider them "adjacent" (same session). */
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
      pairedWith: null,
    }
  })

  // Detect adjacent segments that could be paired (same session)
  for (let i = 0; i < infos.length - 1; i++) {
    const gap = infos[i + 1].startSeconds - infos[i].endSeconds
    if (gap >= 0 && gap < ADJACENT_GAP_THRESHOLD) {
      infos[i].pairedWith = i + 1
      infos[i + 1].pairedWith = i
    }
  }

  return infos
}

export function RenderAssets({
  project,
  timestampsResult,
  fps,
  selection,
  onSelectionChange,
  disabled,
}: RenderAssetsProps): React.ReactElement {
  const segments = React.useMemo(
    () => buildSegmentInfos(project, timestampsResult, fps),
    [project, timestampsResult, fps],
  )

  const toggleSegment = (index: number) => {
    const next = new Set(selection.segments)
    const nextLaps = new Set(selection.laps)

    if (next.has(index)) {
      next.delete(index)
      // Deselect all laps in this segment
      for (const lap of segments[index].laps) {
        nextLaps.delete(`${index}:${lap.number}`)
      }
    } else {
      next.add(index)
      // Select all laps in this segment
      for (const lap of segments[index].laps) {
        nextLaps.add(`${index}:${lap.number}`)
      }
    }
    onSelectionChange({ segments: next, laps: nextLaps })
  }

  const togglePair = (a: number, b: number) => {
    const bothSelected = selection.segments.has(a) && selection.segments.has(b)
    const next = new Set(selection.segments)
    const nextLaps = new Set(selection.laps)

    if (bothSelected) {
      next.delete(a)
      next.delete(b)
      for (const seg of [segments[a], segments[b]]) {
        for (const lap of seg.laps) {
          nextLaps.delete(`${seg.index}:${lap.number}`)
        }
      }
    } else {
      next.add(a)
      next.add(b)
      for (const seg of [segments[a], segments[b]]) {
        for (const lap of seg.laps) {
          nextLaps.add(`${seg.index}:${lap.number}`)
        }
      }
    }
    onSelectionChange({ segments: next, laps: nextLaps })
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

  // Selected segments for lap display
  const selectedSegments = segments.filter((s) => selection.segments.has(s.index))

  // Track which segments we've already rendered (to avoid duplicates from pairs)
  const rendered = new Set<number>()

  return (
    <>
      {/* SEGMENTS */}
      <section>
        <SectionLabel>Segments</SectionLabel>
        <div className="rounded-md border border-border bg-accent">
          {segments.map((seg, i) => {
            if (rendered.has(seg.index)) return null
            rendered.add(seg.index)

            const isPaired = seg.pairedWith !== null
            const pairPartner = isPaired ? segments[seg.pairedWith!] : null

            if (isPaired && pairPartner && seg.pairedWith! > seg.index) {
              // Render as a paired group
              rendered.add(pairPartner.index)
              const bothSelected = selection.segments.has(seg.index) && selection.segments.has(pairPartner.index)

              return (
                <div key={seg.index}>
                  {i > 0 && <div className="border-t border-border" />}
                  {/* Pair header */}
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-accent/80">
                    <Checkbox
                      checked={bothSelected}
                      onCheckedChange={() => togglePair(seg.index, pairPartner.index)}
                      disabled={disabled}
                    />
                    <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <div className="flex flex-1 flex-col">
                      <span className="text-xs font-medium text-foreground">
                        {seg.label} + {pairPartner.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(seg.startSeconds)} – {formatTime(pairPartner.endSeconds)}
                      </span>
                    </div>
                  </label>
                  {/* Individual segments within pair */}
                  <div className="ml-8 border-t border-border/50">
                    {[seg, pairPartner].map((s) => (
                      <label key={s.index} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-accent/80">
                        <Checkbox
                          checked={selection.segments.has(s.index)}
                          onCheckedChange={() => toggleSegment(s.index)}
                          disabled={disabled}
                          className="h-3.5 w-3.5"
                        />
                        <div className="flex flex-1 items-center justify-between">
                          <span className="text-[11px] text-foreground">{s.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(s.startSeconds)} – {formatTime(s.endSeconds)} · {s.laps.length} laps
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )
            }

            // Single segment
            return (
              <div key={seg.index}>
                {i > 0 && <div className="border-t border-border" />}
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-accent/80">
                  <Checkbox
                    checked={selection.segments.has(seg.index)}
                    onCheckedChange={() => toggleSegment(seg.index)}
                    disabled={disabled}
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{seg.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(seg.startSeconds)} – {formatTime(seg.endSeconds)} · {seg.laps.length} laps
                    </span>
                  </div>
                </label>
              </div>
            )
          })}
        </div>
      </section>

      {/* LAPS */}
      {selectedSegments.length > 0 && (
        <section>
          <SectionLabel>Laps</SectionLabel>
          <div className="rounded-md border border-border bg-accent">
            {selectedSegments.map((seg, si) => (
              <div key={seg.index}>
                {si > 0 && <div className="border-t border-border" />}
                {selectedSegments.length > 1 && (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{seg.label}</span>
                  </div>
                )}
                {seg.laps.map((lap, li) => {
                  const key = `${seg.index}:${lap.number}`
                  return (
                    <div key={key}>
                      {(li > 0 || selectedSegments.length > 1) && <div className="border-t border-border/50" />}
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-accent/80">
                        <Checkbox
                          checked={selection.laps.has(key)}
                          onCheckedChange={() => toggleLap(seg.index, lap.number)}
                          disabled={disabled}
                          className="h-3.5 w-3.5"
                        />
                        <div className="flex flex-1 items-center justify-between">
                          <span className="text-[11px] text-foreground">Lap {lap.number}</span>
                          <span className="text-[10px] text-muted-foreground">{formatLapTime(lap.lapTime)}</span>
                        </div>
                      </label>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
