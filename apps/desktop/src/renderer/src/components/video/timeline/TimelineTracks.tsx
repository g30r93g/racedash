import React from 'react'
import type { MultiVideoInfo, TimestampsResult } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import type { Override } from '../../../screens/editor/tabs/TimingTab'
import {
  SEGMENT_COLOURS,
  LAP_COLOUR,
  TRACK_PADDING_PX,
  pct,
  formatRulerLabel,
  rulerTicks,
  type LapSpan,
  type PositionDot,
  type RawLap,
  type RawSegment,
  deriveLapSpans,
  derivePositionDots,
  positionDotColor,
} from './types'

interface TimelineTracksProps {
  project: ProjectData
  duration: number
  fps: number
  zoom: number
  multiVideoInfo?: MultiVideoInfo | null
  timestampsResult?: TimestampsResult | null
  overrides?: Override[]
  onSeek?: (time: number) => void
  children?: React.ReactNode // Playhead slot
}

export const TimelineTracks = React.memo(function TimelineTracks({
  project,
  duration,
  fps,
  zoom,
  multiVideoInfo,
  timestampsResult,
  overrides = [],
  onSeek,
  children,
}: TimelineTracksProps): React.ReactElement {
  // Use engine-computed offsets (globalised) when available, fall back to raw videoOffsetFrame.
  // Segment length = sum of lap times (from the last lap's cumulative value).
  const segmentSpans = React.useMemo(
    () =>
      project.segments.map((seg, i) => {
        const startSeconds = timestampsResult?.offsets[i] ?? (seg.videoOffsetFrame ?? 0) / fps
        // Derive end from lap data: offset + last lap's cumulative time
        const rawSeg = timestampsResult?.segments[i] as RawSegment | undefined
        const laps = rawSeg?.selectedDriver?.laps as RawLap[] | undefined
        const lastLap = laps?.[laps.length - 1]
        const endSeconds = lastLap ? startSeconds + lastLap.cumulative : startSeconds
        return { label: seg.label, startSeconds, endSeconds }
      }),
    [project.segments, timestampsResult, fps],
  )

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

  return (
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
            style={{ left: pct(t, duration) }}
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
              left: pct(t, duration),
              width: major ? 1.5 : 1,
              backgroundColor: major ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
            }}
          />
        ))}

        {/* VIDEO */}
        <div className="relative flex-1">
          {multiVideoInfo && multiVideoInfo.files.length > 1 ? (
            multiVideoInfo.files.map((file, i) => {
              const name = file.path.split(/[\\/]/).pop() ?? file.path
              return (
                <div
                  key={i}
                  className="absolute inset-y-1 flex items-center overflow-hidden rounded-sm bg-[#3a3a3a] px-1"
                  style={{
                    left: pct(file.startSeconds, duration),
                    width: pct(file.durationSeconds, duration),
                    // Subtle alternating shade to distinguish files
                    backgroundColor: i % 2 === 0 ? '#3a3a3a' : '#444444',
                  }}
                >
                  <span className="truncate text-[10px] text-white/50">{name}</span>
                </div>
              )
            })
          ) : (
            <div
              className="absolute inset-y-1 flex items-center overflow-hidden rounded-sm bg-[#3a3a3a] px-1"
              style={{ left: '0%', width: '100%' }}
            >
              {project.videoPaths[0] && (
                <span className="truncate text-[10px] text-white/50">
                  {project.videoPaths[0].split(/[\\/]/).pop()}
                </span>
              )}
            </div>
          )}
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
                  left: pct(seg.startSeconds, duration),
                  width: pct(seg.endSeconds - seg.startSeconds, duration),
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
                  left: pct(lap.startSeconds, duration),
                  width: pct(lap.endSeconds - lap.startSeconds, duration),
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
                    left: pct(dot.videoSeconds, duration),
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
                    left: pct(dot.videoSeconds, duration),
                    backgroundColor: positionDotColor(dot.direction),
                  }}
                  onClick={() => onSeek?.(dot.videoSeconds)}
                />
              ))}
            </>
          )}
        </div>

        {/* Playhead (passed as children to avoid currentTime dependency) */}
        {children}
      </div>
    </div>
  )
})
