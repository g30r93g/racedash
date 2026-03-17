import React, { useEffect, useState } from 'react'
import type { TimestampsResult, VideoInfo } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionLabel } from '@/components/app/SectionLabel'
import { TimingTable } from '@/components/app/TimingTable'
import type { LapRow } from '@/components/app/TimingTable'
import { DriverPickerModal } from '@/components/app/DriverPickerModal'
import { OptionGroup } from '@/components/ui/option-group'
import { Spinner } from '@/components/loaders/Spinner'


interface TimingTabProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
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

  // ── Timing data ─────────────────────────────────────────────────────────────
  const segmentLabels = project.segments.map((s, i) => s.label || `Segment ${i + 1}`)
  const [activeSegment, setActiveSegment] = useState(0)
  const [timestampsResult, setTimestampsResult] = useState<TimestampsResult | null>(null)
  const [timingLoading, setTimingLoading] = useState(false)
  const [timingError, setTimingError] = useState<string | null>(null)

  useEffect(() => {
    // videoInfo===null means still loading; wait for fps before calling generateTimestamps
    // so frame-based offsets (e.g. "5568 F") can be converted correctly.
    if (videoInfo === null) return
    let cancelled = false
    setTimingLoading(true)
    setTimingError(null)
    window.racedash
      .generateTimestamps({ configPath: project.configPath, fps: videoInfo?.fps ?? undefined })
      .then((result) => { if (!cancelled) setTimestampsResult(result) })
      .catch((err) => { if (!cancelled) setTimingError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setTimingLoading(false) })
    return () => { cancelled = true }
  }, [activeSegment, project.configPath, videoInfo])

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
      {/* DRIVER PICKER MODAL */}
      <DriverPickerModal
        open={showDriverPicker}
        onOpenChange={setShowDriverPicker}
        configPath={project.configPath}
        onSelect={(name) => setSelectedDriver(name)}
      />

      {/* DRIVER */}
      <section>
        <SectionLabel>Driver</SectionLabel>
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <span className="text-sm text-foreground">{selectedDriver}</span>
          <Button variant="ghost" size="sm" onClick={() => setShowDriverPicker(true)}>Change</Button>
        </div>
      </section>

      {/* TIMING DATA */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Timing Data</SectionLabel>
          <Button variant="ghost" size="sm">Edit</Button>
        </div>

        {segmentLabels.length > 1 && (
          <div className="mb-3">
            <OptionGroup
              options={segmentLabels.map((label, i) => ({ value: String(i), label }))}
              value={String(activeSegment)}
              onValueChange={(val) => setActiveSegment(Number(val))}
            />
          </div>
        )}

        {timingLoading && <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />}
        {timingError && <p className="text-xs text-destructive">{timingError}</p>}
        {!timingLoading && !timingError && lapRows.length > 0 && (
          <TimingTable rows={lapRows} bestLapTimeMs={bestLapTime ?? undefined} />
        )}
        {!timingLoading && !timingError && lapRows.length === 0 && (
          <p className="text-xs text-muted-foreground">No timing data available.</p>
        )}
      </section>

      {/* POSITION OVERRIDES */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Position Overrides</SectionLabel>
          <Button variant="ghost" size="sm" onClick={() => setShowOverrideForm((v) => !v)}>+ Add</Button>
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-5 w-5 hover:text-destructive"
                  onClick={() => setOverrides((prev) => prev.filter((x) => x.id !== o.id))}
                  aria-label="Remove override"
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
