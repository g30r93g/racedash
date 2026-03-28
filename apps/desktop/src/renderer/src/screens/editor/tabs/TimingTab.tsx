import { Plus } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { TimestampsResult, VideoInfo } from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { TimingTable } from '@/components/timing/TimingTable'
import type { LapRow } from '@/components/timing/TimingTable'
import { DriverPickerModal } from '@/components/shared/DriverPickerModal'
import { OptionGroup } from '@/components/ui/option-group'
import { Spinner } from '@/components/loaders/Spinner'
import { ProjectEditWizard } from '@/screens/wizard/ProjectEditWizard'

interface TimingTabProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
  currentTime?: number
  playing?: boolean
  overrides: Override[]
  onOverridesChange: (overrides: Override[]) => void
  timestampsResult?: TimestampsResult | null
  timingLoading?: boolean
  timingError?: string | null
  onProjectUpdate: (updated: ProjectData) => void
}

export interface Override {
  id: string
  segmentIndex: number
  timecode: string
  position: string
}

export function TimingTab({
  project,
  videoInfo,
  currentTime = 0,
  playing = false,
  overrides,
  onOverridesChange,
  timestampsResult = null,
  timingLoading = false,
  timingError = null,
  onProjectUpdate,
}: TimingTabProps): React.ReactElement {
  // ── Driver ──────────────────────────────────────────────────────────────────
  const [selectedDrivers, setSelectedDrivers] = useState(project.selectedDrivers)
  const [showDriverPicker, setShowDriverPicker] = useState(false)

  // ── Edit wizard ─────────────────────────────────────────────────────────────
  const [editWizardOpen, setEditWizardOpen] = useState(false)

  // ── Timing data ─────────────────────────────────────────────────────────────
  const segmentLabels = project.segments.map((s, i) => s.label || `Segment ${i + 1}`)
  const [activeSegment, setActiveSegment] = useState(0)

  // Auto-switch segment on boundary crossings and when playback starts.
  // While within the same segment the user may switch freely to compare.
  const playheadSegmentRef = useRef<number | null>(null)

  const getPlayheadSegment = useCallback(() => {
    if (!timestampsResult || timestampsResult.offsets.length <= 1) return null
    const { offsets } = timestampsResult
    let seg = 0
    for (let i = 0; i < offsets.length; i++) {
      if (currentTime >= offsets[i]) seg = i
    }
    return seg
  }, [currentTime, timestampsResult])

  // Snap to playhead segment when crossing a boundary
  useEffect(() => {
    const seg = getPlayheadSegment()
    if (seg === null) return
    if (seg !== playheadSegmentRef.current) {
      playheadSegmentRef.current = seg
      setActiveSegment(seg)
    }
  }, [getPlayheadSegment])

  // Snap to playhead segment when playback starts
  useEffect(() => {
    if (!playing) return
    const seg = getPlayheadSegment()
    if (seg !== null) setActiveSegment(seg)
  }, [playing, getPlayheadSegment])

  // Sync selectedDrivers when project updates (e.g. after edit wizard save)
  useEffect(() => {
    setSelectedDrivers(project.selectedDrivers)
  }, [project.selectedDrivers])

  const lapRows = React.useMemo<LapRow[]>(() => {
    if (!timestampsResult) return []
    const seg = timestampsResult.segments[activeSegment]
    if (!seg?.selectedDriver) return []

    const { laps } = seg.selectedDriver
    const mode = seg.config.mode as 'practice' | 'qualifying' | 'race'
    const selectedKart = seg.selectedDriver.kart
    const selectedName = seg.selectedDriver.name
    const allDrivers = seg.drivers ?? []
    const canPosition = seg.capabilities['position'] === true
    const hasSnapshots = seg.capabilities['raceSnapshots'] === true

    const isSelected = (d: { kart: string; name: string }) =>
      selectedKart ? d.kart === selectedKart : d.name === selectedName

    const lapRowItems: LapRow[] = laps.map((lap, lapIndex) => {
      const timeMs = lap.lapTime * 1000
      let position: number | null = null

      if (mode === 'race') {
        if (hasSnapshots && seg.replayData) {
          for (const snapshot of seg.replayData) {
            const entry = snapshot.find((e) => e.kart === selectedKart && e.lapsCompleted === lap.number)
            if (entry) {
              position = entry.position
              break
            }
          }
        } else if (canPosition && allDrivers.length > 0) {
          const ourCumulative = lap.cumulative
          const betterCount = allDrivers.filter((d) => {
            if (isSelected(d)) return false
            const theirLap = d.laps[lapIndex]
            return theirLap != null && theirLap.cumulative < ourCumulative
          }).length
          position = betterCount + 1
        }
      } else {
        if (canPosition && allDrivers.length > 0) {
          let bestSoFar = Infinity
          for (let i = 0; i <= lapIndex; i++) {
            if (laps[i].lapTime < bestSoFar) bestSoFar = laps[i].lapTime
          }
          if (Number.isFinite(bestSoFar)) {
            const betterCount = allDrivers.filter((d) => {
              if (isSelected(d)) return false
              const driverBest = d.laps.reduce((best, l) => Math.min(best, l.lapTime), Infinity)
              return driverBest < bestSoFar
            }).length
            position = betterCount + 1
          }
        }
      }

      return { lap: lap.number, timeMs, position }
    })

    if (mode === 'race') {
      let gridPosition: number | null = null
      if (hasSnapshots && seg.replayData) {
        for (const snapshot of seg.replayData) {
          const entry = snapshot.find((e) => e.kart === selectedKart && e.lapsCompleted === 0)
          if (entry) {
            gridPosition = entry.position
            break
          }
        }
      }
      lapRowItems.unshift({ lap: 0, timeMs: 0, position: gridPosition, lapTimeLabel: '—' })
    }

    return lapRowItems
  }, [timestampsResult, activeSegment])

  const bestLapTime = lapRows.length > 0 ? Math.min(...lapRows.filter((l) => l.lap > 0).map((l) => l.timeMs)) : null

  const activeLapNumber = React.useMemo<number | null>(() => {
    if (!timestampsResult) return null
    const seg = timestampsResult.segments[activeSegment]
    const laps = seg?.selectedDriver?.laps
    if (!laps || laps.length === 0) return null
    const offset = timestampsResult.offsets[activeSegment] ?? 0
    for (let i = 0; i < laps.length; i++) {
      const lapStart = offset + laps[i].cumulative - laps[i].lapTime
      const lapEnd = offset + laps[i].cumulative
      if (currentTime >= lapStart && (currentTime < lapEnd || i === laps.length - 1)) {
        return laps[i].number
      }
    }
    return null
  }, [timestampsResult, activeSegment, currentTime])

  // ── Position overrides ───────────────────────────────────────────────────────
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [newTimecode, setNewTimecode] = useState('')
  const [newPosition, setNewPosition] = useState('')

  function addOverride() {
    if (!newTimecode.trim() || !newPosition.trim()) return
    onOverridesChange([
      ...overrides,
      {
        id: crypto.randomUUID(),
        segmentIndex: activeSegment,
        timecode: newTimecode.trim(),
        position: newPosition.trim(),
      },
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
        onSelect={(name) => setSelectedDrivers((prev) => ({ ...prev, [segmentLabels[activeSegment]]: name }))}
      />

      {/* EDIT WIZARD */}
      {editWizardOpen && (
        <ProjectEditWizard
          project={project}
          onSave={(updated) => {
            setEditWizardOpen(false)
            onProjectUpdate(updated)
          }}
          onCancel={() => setEditWizardOpen(false)}
        />
      )}

      {/* DRIVER */}
      <section>
        <SectionLabel>Driver</SectionLabel>
        <div className="flex items-center justify-between rounded-md border border-border bg-accent px-3 py-2">
          <span className="text-sm text-foreground">{selectedDrivers[segmentLabels[activeSegment]] ?? '—'}</span>
          <Button variant="ghost" size="sm" onClick={() => setShowDriverPicker(true)}>
            Change
          </Button>
        </div>
      </section>

      {/* TIMING DATA */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Timing Data</SectionLabel>
          <Button variant="ghost" size="sm" onClick={() => setEditWizardOpen(true)}>
            Edit
          </Button>
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

        {timingLoading && lapRows.length === 0 && (
          <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        )}
        {timingError && <p className="text-xs text-destructive">{timingError}</p>}
        {!timingError && lapRows.length > 0 && (
          <div className={timingLoading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            <TimingTable
              rows={lapRows}
              bestLapTimeMs={bestLapTime ?? undefined}
              activeLapNumber={activeLapNumber ?? undefined}
              mode={
                (timestampsResult?.segments[activeSegment]?.config.mode as 'practice' | 'qualifying' | 'race') ??
                undefined
              }
            />
          </div>
        )}
        {!timingLoading && !timingError && lapRows.length === 0 && (
          <p className="text-xs text-muted-foreground">No timing data available.</p>
        )}
      </section>

      {/* POSITION OVERRIDES */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Position Overrides</SectionLabel>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!showOverrideForm && videoInfo?.fps) {
                setNewTimecode(`${Math.round(currentTime * videoInfo.fps)} F`)
              }
              setShowOverrideForm((v) => !v)
            }}
          >
            <Plus size={14} /> Add
          </Button>
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
            <Button size="sm" onClick={addOverride}>
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowOverrideForm(false)}>
              Cancel
            </Button>
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
                  onClick={() => onOverridesChange(overrides.filter((x) => x.id !== o.id))}
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
