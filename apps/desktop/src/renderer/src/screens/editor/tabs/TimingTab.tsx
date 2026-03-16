import React, { useCallback, useEffect, useState } from 'react'
import type { DriversResult, TimestampsResult, VideoInfo } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function formatLapTime(ms: number): string {
  const totalMs = Math.round(ms)
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  )
}

interface TimingTabProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
}

interface LapRow {
  lap: number
  timeMs: number
  position: number
}

interface Override {
  id: string
  timecode: string
  position: string
}

export function TimingTab({ project, videoInfo }: TimingTabProps): React.ReactElement {
  // ── Driver ──────────────────────────────────────────────────────────────────
  const [selectedDriver, setSelectedDriver] = useState(project.selectedDriver)
  const [showDriverPicker, setShowDriverPicker] = useState(false)
  const [driversResult, setDriversResult] = useState<DriversResult | null>(null)
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState<string | null>(null)

  const openDriverPicker = useCallback(async () => {
    setShowDriverPicker(true)
    setDriversLoading(true)
    setDriversError(null)
    try {
      const result = await window.racedash.listDrivers({ configPath: project.projectPath })
      setDriversResult(result)
    } catch (err) {
      setDriversError(err instanceof Error ? err.message : String(err))
    } finally {
      setDriversLoading(false)
    }
  }, [project.projectPath])

  // ── Timing data ─────────────────────────────────────────────────────────────
  const segmentLabels = project.segments.map((s, i) => s.label || `Segment ${i + 1}`)
  const [activeSegment, setActiveSegment] = useState(0)
  const [timestampsResult, setTimestampsResult] = useState<TimestampsResult | null>(null)
  const [timingLoading, setTimingLoading] = useState(false)
  const [timingError, setTimingError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setTimingLoading(true)
    setTimingError(null)
    window.racedash
      .generateTimestamps({ configPath: project.projectPath, fps: videoInfo?.fps ?? undefined })
      .then((result) => { if (!cancelled) setTimestampsResult(result) })
      .catch((err) => { if (!cancelled) setTimingError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setTimingLoading(false) })
    return () => { cancelled = true }
  }, [activeSegment, project.projectPath, videoInfo?.fps])

  const lapRows = React.useMemo<LapRow[]>(() => {
    if (!timestampsResult) return []
    const seg = timestampsResult.segments[activeSegment]
    if (!seg?.selectedDriver) return []
    return seg.selectedDriver.laps as LapRow[]
  }, [timestampsResult, activeSegment])

  const bestLapTime = lapRows.length > 0 ? Math.min(...lapRows.map((l) => l.timeMs)) : null

  // ── Position overrides ───────────────────────────────────────────────────────
  const [overrides, setOverrides] = useState<Override[]>([])
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [newTimecode, setNewTimecode] = useState('')
  const [newPosition, setNewPosition] = useState('')

  function addOverride() {
    if (!newTimecode.trim() || !newPosition.trim()) return
    setOverrides((prev) => [
      ...prev,
      { id: crypto.randomUUID(), timecode: newTimecode.trim(), position: newPosition.trim() },
    ])
    setNewTimecode('')
    setNewPosition('')
    setShowOverrideForm(false)
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* DRIVER */}
      <section>
        <SectionLabel>Driver</SectionLabel>
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <span className="text-sm text-foreground">{selectedDriver}</span>
          <button onClick={openDriverPicker} className="text-xs text-primary hover:underline">
            Change
          </button>
        </div>
      </section>

      {/* DRIVER PICKER MODAL */}
      {showDriverPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowDriverPicker(false)}
        >
          <div
            className="w-[360px] rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-foreground">Choose Driver</p>
            {driversLoading && <p className="text-xs text-muted-foreground">Loading drivers…</p>}
            {driversError && <p className="text-xs text-destructive">{driversError}</p>}
            {!driversLoading && !driversError && driversResult && (
              <ul className="flex flex-col gap-1">
                {driversResult.segments.flatMap((seg) =>
                  seg.drivers.map((d) => (
                    <li key={`${seg.config.source}-${d.name}`}>
                      <button
                        className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                        onClick={() => { setSelectedDriver(d.name); setShowDriverPicker(false) }}
                      >
                        {d.kart ? `[${d.kart.padStart(3, ' ')}] ${d.name}` : d.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowDriverPicker(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* TIMING DATA */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Timing Data</SectionLabel>
          <button className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
        </div>

        {segmentLabels.length > 1 && (
          <div className="mb-3 flex gap-1">
            {segmentLabels.map((label, i) => (
              <button
                key={i}
                onClick={() => setActiveSegment(i)}
                className={cn(
                  'rounded px-3 py-1 text-xs',
                  activeSegment === i
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {timingLoading && <p className="text-xs text-muted-foreground">Loading timing data…</p>}
        {timingError && <p className="text-xs text-destructive">{timingError}</p>}
        {!timingLoading && !timingError && lapRows.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="py-1 text-left font-medium text-muted-foreground">LAP</th>
                <th className="py-1 text-left font-medium text-muted-foreground">TIME</th>
                <th className="py-1 text-left font-medium text-muted-foreground">POS</th>
              </tr>
            </thead>
            <tbody>
              {lapRows.map((row) => (
                <tr
                  key={row.lap}
                  className={row.timeMs === bestLapTime ? 'text-foreground' : 'text-muted-foreground'}
                >
                  <td className="py-1">{row.lap}</td>
                  <td className="py-1 font-medium">{formatLapTime(row.timeMs)}</td>
                  <td className="py-1">P{row.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!timingLoading && !timingError && lapRows.length === 0 && (
          <p className="text-xs text-muted-foreground">No timing data available.</p>
        )}
      </section>

      {/* POSITION OVERRIDES */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Position Overrides</SectionLabel>
          <button
            onClick={() => setShowOverrideForm((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            + Add
          </button>
        </div>

        {showOverrideForm && (
          <div className="mb-3 flex gap-2">
            <Input
              value={newTimecode}
              onChange={(e) => setNewTimecode(e.target.value)}
              placeholder="0:08.200"
              className="w-24"
            />
            <Input
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              placeholder="P3"
              className="w-16"
            />
            <Button size="sm" onClick={addOverride}>Add</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowOverrideForm(false)}>Cancel</Button>
          </div>
        )}

        {overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground">No overrides added.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-xs text-foreground">
                <span className="w-20 font-mono">{o.timecode}</span>
                <span className="text-muted-foreground">→</span>
                <span className="w-10 font-medium">{o.position}</span>
                <button
                  onClick={() => setOverrides((prev) => prev.filter((x) => x.id !== o.id))}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label="Remove override"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
