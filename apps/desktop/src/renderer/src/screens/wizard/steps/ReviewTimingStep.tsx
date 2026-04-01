// apps/desktop/src/renderer/src/screens/wizard/steps/ReviewTimingStep.tsx
import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/loaders/Spinner'
import { isValidLapTime } from '@/components/timing/ManualLapEntry'
import type { SegmentConfig } from '../../../../types/project'
import type { LapPreview } from '../../../../types/ipc'

interface ReviewTimingStepProps {
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
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

function SegmentReview({
  segment,
  selectedDriver,
}: {
  segment: SegmentConfig
  selectedDriver: string
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

  const currentLap = laps[currentLapIndex]
  const bestLapTime = Math.min(...laps.map((l) => l.lapTime))
  const isBest = currentLap.lapTime === bestLapTime

  return (
    <div className="flex flex-col gap-4">
      {/* Lap stepper */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentLapIndex((i) => Math.max(0, i - 1))}
            disabled={currentLapIndex === 0}
          >
            ← Prev
          </Button>
          <select
            value={currentLapIndex}
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
            disabled={currentLapIndex === laps.length - 1}
          >
            Next →
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {currentLapIndex + 1} of {laps.length}
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

export function ReviewTimingStep({ segments, selectedDrivers }: ReviewTimingStepProps): React.ReactElement {
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0)
  const activeSegment = segments[activeSegmentIndex]
  const activeDriver = selectedDrivers[activeSegment?.label] ?? ''

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

      {/* Lap review */}
      {activeSegment && <SegmentReview segment={activeSegment} selectedDriver={activeDriver} />}
    </div>
  )
}
