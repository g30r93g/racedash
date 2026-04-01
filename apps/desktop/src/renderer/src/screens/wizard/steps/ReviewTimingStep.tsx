import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/loaders/Spinner'
import { isValidLapTime } from '@/components/timing/ManualLapEntry'
import { useMultiVideo, resolveFileAtTime, type FileEntry } from '@/hooks/useMultiVideo'
import type { SegmentConfig } from '../../../../types/project'
import type { LapPreview } from '../../../../types/ipc'

interface ReviewTimingStepProps {
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
  /** All video paths in the project (segments reference these by index). */
  videoPaths: string[]
}

function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function parseLapTimeToSeconds(value: string): number {
  const t = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(t)) return parseFloat(t)
  const parts = t.split(':')
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
  if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
  return 0
}

function resolveManualLaps(timingData: NonNullable<SegmentConfig['timingData']>): LapPreview[] {
  return timingData
    .filter((entry) => isValidLapTime(entry.time))
    .map((entry) => ({
      number: entry.lap,
      lapTime: parseLapTimeToSeconds(entry.time),
      position: entry.position,
    }))
}

// ---------------------------------------------------------------------------
// LapFramePreview — shows the video frame at a specific lap's start time
// ---------------------------------------------------------------------------

function LapFramePreview({
  segmentVideoPaths,
  offsetFrame,
  laps,
  currentLapIndex,
}: {
  segmentVideoPaths: string[]
  offsetFrame: number
  laps: LapPreview[]
  currentLapIndex: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const multiInfo = useMultiVideo(segmentVideoPaths)
  const [videoReady, setVideoReady] = useState(false)
  const [activeSrc, setActiveSrc] = useState('')

  const files: FileEntry[] = useMemo(
    () =>
      multiInfo?.files.map((f) => ({
        path: f.path,
        durationSeconds: f.durationSeconds,
        startSeconds: f.startSeconds,
      })) ?? [],
    [multiInfo],
  )

  const fps = multiInfo?.fps ?? 30

  // Calculate the virtual time for the start of the current lap
  // Lap N starts at: offset + sum(lap times for laps 1..N-1)
  const lapStartSeconds = useMemo(() => {
    const offsetSeconds = offsetFrame / fps
    let cumulative = offsetSeconds
    for (let i = 0; i < currentLapIndex; i++) {
      cumulative += laps[i].lapTime
    }
    return cumulative
  }, [offsetFrame, fps, currentLapIndex, laps])

  // Resolve which file and local time
  const resolved = files.length > 0 ? resolveFileAtTime(files, lapStartSeconds) : null
  const targetPath = resolved?.path ?? segmentVideoPaths[0] ?? ''
  const targetSrc = targetPath.startsWith('/') ? `media://${targetPath}` : targetPath
  const targetLocalTime = resolved?.localTime ?? lapStartSeconds
  // Seek to the middle of the target frame to avoid boundary snapping
  const halfFrame = 0.5 / fps

  // Switch video src when the active file changes
  useEffect(() => {
    if (targetSrc !== activeSrc) {
      setActiveSrc(targetSrc)
      setVideoReady(false)
    }
  }, [targetSrc, activeSrc])

  // Seek to the correct local time once video is ready
  useEffect(() => {
    const video = videoRef.current
    if (!video || video.readyState < 1) return
    video.currentTime = targetLocalTime + halfFrame
  }, [targetLocalTime, halfFrame, videoReady])

  if (segmentVideoPaths.length === 0) return null

  if (!multiInfo) {
    return (
      <div className="flex items-center justify-center rounded-md bg-black" style={{ aspectRatio: '16/9' }}>
        <Spinner name="checkerboard" size="1.25rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16/9' }}>
      <video
        key={activeSrc}
        ref={videoRef}
        src={activeSrc}
        className="h-full w-full object-contain"
        muted
        preload="auto"
        onLoadedMetadata={() => {
          const video = videoRef.current
          if (!video) return
          video.currentTime = targetLocalTime + halfFrame
        }}
        onCanPlay={() => setVideoReady(true)}
      />
      {!videoReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <Spinner name="checkerboard" size="1.25rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
        {files.length > 1 && resolved && (
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white/60">
            File {resolved.fileIndex + 1}/{files.length}
          </span>
        )}
        <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
          {formatLapTime(lapStartSeconds)}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SegmentReview
// ---------------------------------------------------------------------------

function SegmentReview({
  segment,
  selectedDriver,
  segmentVideoPaths,
}: {
  segment: SegmentConfig
  selectedDriver: string
  segmentVideoPaths: string[]
}) {
  const [laps, setLaps] = useState<LapPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentLapIndex, setCurrentLapIndex] = useState(0)

  const fetchLaps = useCallback(async () => {
    if (segment.source === 'manual') {
      setLaps(resolveManualLaps(segment.timingData ?? []))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.racedash.previewTimestamps([segment], { [segment.label]: selectedDriver })
      const match = result.find((s) => s.label === segment.label) ?? result[0]
      setLaps(match?.laps ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [segment, selectedDriver])

  useEffect(() => {
    setCurrentLapIndex(0)
    fetchLaps()
  }, [fetchLaps])

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
        <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        Fetching lap data...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">Failed to load lap data</p>
          <p className="mt-1 font-mono text-xs opacity-80">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLaps}>
          Retry
        </Button>
      </div>
    )
  }

  if (laps.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No laps found for <span className="font-medium">{selectedDriver}</span>.
      </p>
    )
  }

  const safeIndex = Math.min(currentLapIndex, laps.length - 1)
  const currentLap = laps[safeIndex]
  const bestLapTime = Math.min(...laps.map((l) => l.lapTime))
  const isBest = currentLap.lapTime === bestLapTime

  return (
    <div className="flex flex-col gap-4">
      {/* Video frame preview */}
      <LapFramePreview
        segmentVideoPaths={segmentVideoPaths}
        offsetFrame={segment.videoOffsetFrame ?? 0}
        laps={laps}
        currentLapIndex={safeIndex}
      />

      {/* Lap stepper */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentLapIndex((i) => Math.max(0, i - 1))}
            disabled={safeIndex === 0}
          >
            ← Prev
          </Button>
          <select
            value={safeIndex}
            onChange={(e) => setCurrentLapIndex(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            {laps.map((lap, i) => (
              <option key={lap.number} value={i}>
                Lap {lap.number}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentLapIndex((i) => Math.min(laps.length - 1, i + 1))}
            disabled={safeIndex === laps.length - 1}
          >
            Next →
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {safeIndex + 1} of {laps.length}
        </span>
      </div>

      {/* Current lap details */}
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lap</p>
            <p className="text-lg font-semibold text-foreground">{currentLap.number}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Time</p>
            <p className={`font-mono text-lg font-semibold ${isBest ? 'text-primary' : 'text-foreground'}`}>
              {formatLapTime(currentLap.lapTime)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Position</p>
            <p className="text-lg font-semibold text-foreground">
              {currentLap.position !== undefined ? `P${currentLap.position}` : '—'}
            </p>
          </div>
        </div>
        {isBest && (
          <span className="mt-2 inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            BEST LAP
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReviewTimingStep
// ---------------------------------------------------------------------------

export function ReviewTimingStep({ segments, selectedDrivers, videoPaths }: ReviewTimingStepProps): React.ReactElement {
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0)
  const activeSegment = segments[activeSegmentIndex]
  const activeDriver = selectedDrivers[activeSegment?.label] ?? ''

  // Resolve the video paths for the active segment
  const segmentVideoPaths = useMemo(
    () => (activeSegment?.videoIndices ?? []).map((i) => videoPaths[i]).filter(Boolean),
    [activeSegment, videoPaths],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Segment tabs (<=4) or dropdown (>4) */}
      {segments.length > 1 && segments.length <= 4 && (
        <div className="flex gap-1 rounded-lg border border-border bg-accent/20 p-1">
          {segments.map((seg, i) => (
            <button
              key={seg.label}
              type="button"
              onClick={() => setActiveSegmentIndex(i)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                i === activeSegmentIndex
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>
      )}
      {segments.length > 4 && (
        <select
          value={activeSegmentIndex}
          onChange={(e) => setActiveSegmentIndex(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          {segments.map((seg, i) => (
            <option key={seg.label} value={i}>
              {seg.label}
            </option>
          ))}
        </select>
      )}

      {/* Driver info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        Driver: <span className="font-medium text-foreground">{activeDriver}</span>
      </div>

      {/* Lap review with video preview */}
      {activeSegment && (
        <SegmentReview
          segment={activeSegment}
          selectedDriver={activeDriver}
          segmentVideoPaths={segmentVideoPaths}
        />
      )}
    </div>
  )
}
