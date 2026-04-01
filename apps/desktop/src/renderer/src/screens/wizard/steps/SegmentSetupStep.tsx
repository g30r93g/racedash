// apps/desktop/src/renderer/src/screens/wizard/steps/SegmentSetupStep.tsx
import React, { useCallback, useEffect, useState } from 'react'
import type { SegmentConfig, TimingSource, SessionMode } from '../../../../types/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { FileUpload } from '@/components/shared/FileUpload'
import { OptionGroup } from '@/components/ui/option-group'
import { ManualLapDialog, ManualLapSummary, isValidLapTime, type ManualLapEntry } from '@/components/timing/ManualLapEntry'
import { InlineOffsetPicker } from '@/components/video/InlineOffsetPicker'
import { SegmentRow } from '@/components/timing/SegmentRow'
import { Spinner } from '@/components/loaders/Spinner'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMING_SOURCES: { value: TimingSource; label: string }[] = [
  { value: 'alphaTiming', label: 'Alpha Timing' },
  { value: 'daytonaEmail', label: 'Daytona' },
  { value: 'mylapsSpeedhive', label: 'SpeedHive' },
  { value: 'teamsportEmail', label: 'TeamSport' },
  { value: 'manual', label: 'Manual' },
]

const SESSION_MODES: { value: SessionMode; label: string }[] = [
  { value: 'race', label: 'Race' },
  { value: 'qualifying', label: 'Qualifying' },
  { value: 'practice', label: 'Practice' },
]

const SESSION_LABEL_PREFIX: Record<SessionMode, string> = {
  race: 'Race',
  qualifying: 'Qualifying',
  practice: 'Practice',
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriverEntry {
  name: string
  kart?: string
}

interface SegmentSetupStepProps {
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
  onSegmentsChange: (segments: SegmentConfig[]) => void
  onSelectedDriversChange: (drivers: Record<string, string>) => void
  /** Called when the inline segment form opens/closes. Use to hide the wizard footer. */
  onFormActiveChange?: (active: boolean) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDefaultLabel(session: SessionMode, existing: SegmentConfig[]): string {
  const prefix = SESSION_LABEL_PREFIX[session]
  const count = existing.filter((s) => s.session === session).length
  return count === 0 ? prefix : `${prefix} ${count + 1}`
}

function buildSegmentConfig(draft: {
  label: string
  session: SessionMode
  source: TimingSource
  url: string
  eventId: string
  emailPath: string
  manualLaps: ManualLapEntry[]
  videoIndices: number[]
  videoOffsetFrame: number
}): SegmentConfig {
  return {
    label: draft.label.trim(),
    source: draft.source,
    session: draft.session,
    ...(draft.source === 'alphaTiming' ? { url: draft.url } : {}),
    ...(draft.source === 'mylapsSpeedhive' ? { eventId: draft.eventId } : {}),
    ...(draft.source === 'daytonaEmail' ? { emailPath: draft.emailPath } : {}),
    ...(draft.source === 'teamsportEmail' ? { emailPath: draft.emailPath } : {}),
    ...(draft.source === 'manual' ? { timingData: draft.manualLaps } : {}),
    videoOffsetFrame: draft.videoOffsetFrame,
    videoIndices: draft.videoIndices,
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceFields({
  source,
  url,
  setUrl,
  eventId,
  setEventId,
  emailPath,
  setEmailPath,
}: {
  source: TimingSource
  url: string
  setUrl: (v: string) => void
  eventId: string
  setEventId: (v: string) => void
  emailPath: string
  setEmailPath: (v: string) => void
}) {
  if (source === 'alphaTiming') {
    return (
      <FormField label="Results URL">
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
      </FormField>
    )
  }
  if (source === 'mylapsSpeedhive') {
    return (
      <FormField label="Event ID">
        <Input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="123456" />
      </FormField>
    )
  }
  if (source === 'daytonaEmail') {
    return (
      <FormField label="Results file">
        <FileUpload accept={['eml', 'txt']} onFile={setEmailPath} value={emailPath} placeholder="Drop file here or browse" hint=".eml or .txt email export from Daytona" />
      </FormField>
    )
  }
  if (source === 'teamsportEmail') {
    return (
      <FormField label="Results file">
        <FileUpload accept={['eml']} onFile={setEmailPath} value={emailPath} placeholder="Drop file here or browse" hint=".eml email export from TeamSport" />
      </FormField>
    )
  }
  return null
}

function VideoSelector({
  videoPaths,
  selectedIndices,
  onChange,
  assignedByOtherSegments,
}: {
  videoPaths: string[]
  selectedIndices: number[]
  onChange: (indices: number[]) => void
  assignedByOtherSegments: Record<number, string>
}) {
  const selectedSet = new Set(selectedIndices)

  function toggle(index: number) {
    if (selectedSet.has(index)) {
      onChange(selectedIndices.filter((i) => i !== index))
    } else {
      onChange([...selectedIndices, index].sort((a, b) => a - b))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assign videos</p>
      {videoPaths.map((path, index) => {
        const name = path.split(/[\\/]/).pop() ?? path
        const isSelected = selectedSet.has(index)
        const assignedTo = assignedByOtherSegments[index]
        return (
          <button
            key={path}
            type="button"
            onClick={() => !assignedTo && toggle(index)}
            disabled={!!assignedTo}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
              isSelected
                ? 'border-primary bg-primary/10'
                : assignedTo
                  ? 'border-border bg-accent/20 opacity-50'
                  : 'border-border hover:border-primary/50 hover:bg-accent/40'
            }`}
          >
            <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
            <span className="flex-1 truncate font-mono text-xs text-foreground">{name}</span>
            {assignedTo && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {assignedTo}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function DriverPicker({
  segment,
  selectedDriver,
  onDriverChange,
}: {
  segment: SegmentConfig
  selectedDriver: string
  onDriverChange: (driver: string) => void
}) {
  const [drivers, setDrivers] = useState<DriverEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchDrivers = useCallback(async () => {
    if (segment.source === 'manual') return
    setLoading(true)
    setError(null)
    try {
      const result = await window.racedash.previewDrivers([segment])
      const segResult = result.segments.find((r) => r.config.label === segment.label) ?? result.segments[0]
      const entries: DriverEntry[] = (segResult?.drivers ?? []).map((d) => ({
        name: d.name,
        kart: d.kart,
      }))
      setDrivers(entries)
      // Auto-select if single driver
      if (entries.length === 1 && !selectedDriver) {
        onDriverChange(entries[0].name)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [segment, selectedDriver, onDriverChange])

  // Fetch on mount — DriverPicker is conditionally rendered (only when hasTimingData),
  // so it remounts when timing data changes, triggering a fresh fetch.
  useEffect(() => {
    fetchDrivers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (segment.source === 'manual') {
    return (
      <FormField label="Driver name">
        <Input value={selectedDriver} onChange={(e) => onDriverChange(e.target.value)} placeholder="Your name" />
      </FormField>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
        <Spinner name="checkerboard" size="1.25rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        Loading drivers…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={fetchDrivers}>
          Retry
        </Button>
      </div>
    )
  }

  if (drivers.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-accent/40 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Driver</p>
        <p className="text-sm text-foreground">{drivers[0].name}</p>
      </div>
    )
  }

  const filtered = search
    ? drivers.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          d.kart?.toLowerCase().includes(search.toLowerCase()),
      )
    : drivers

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Select your driver</p>
      {drivers.length > 5 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or kart…"
          className="text-xs"
        />
      )}
      <div className="max-h-36 overflow-y-auto rounded-md border border-border">
        {filtered.map((d) => (
          <button
            key={d.name}
            type="button"
            onClick={() => onDriverChange(d.name)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/40 ${
              selectedDriver === d.name ? 'bg-primary/10 text-primary' : 'text-foreground'
            }`}
          >
            <span className="flex-1">{d.name}</span>
            {d.kart && <span className="text-xs text-muted-foreground">#{d.kart}</span>}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No drivers match &ldquo;{search}&rdquo;</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type FormMode = null | { mode: 'add' } | { mode: 'edit'; index: number }

export function SegmentSetupStep({
  videoPaths,
  segments,
  selectedDrivers,
  onSegmentsChange,
  onSelectedDriversChange,
  onFormActiveChange,
}: SegmentSetupStepProps): React.ReactElement {
  const [formMode, setFormMode] = useState<FormMode>(segments.length === 0 ? { mode: 'add' } : null)

  // Notify parent when the inline form opens/closes (hides wizard footer)
  useEffect(() => {
    onFormActiveChange?.(formMode !== null)
  }, [formMode, onFormActiveChange])

  // --- Draft state for the inline form ---
  const [label, setLabel] = useState('')
  const [session, setSession] = useState<SessionMode>('race')
  const [source, setSource] = useState<TimingSource>('alphaTiming')
  const [url, setUrl] = useState('')
  const [eventId, setEventId] = useState('')
  const [emailPath, setEmailPath] = useState('')
  const [manualLaps, setManualLaps] = useState<ManualLapEntry[]>([])
  const [videoIndices, setVideoIndices] = useState<number[]>([])
  const [videoOffsetFrame, setVideoOffsetFrame] = useState(0)
  const [hasSetOffset, setHasSetOffset] = useState(false)
  const [driver, setDriver] = useState('')
  const [showLapDialog, setShowLapDialog] = useState(false)

  // Pre-select all videos if this is the first segment
  useEffect(() => {
    if (formMode?.mode === 'add' && segments.length === 0 && videoPaths.length > 0 && videoIndices.length === 0) {
      setVideoIndices(videoPaths.map((_, i) => i))
    }
  }, [formMode, segments.length, videoPaths.length, videoIndices.length])

  // Auto-set label when session mode changes (only in add mode)
  useEffect(() => {
    if (formMode?.mode === 'add') {
      setLabel(makeDefaultLabel(session, segments))
    }
  }, [session, formMode, segments])

  function resetForm() {
    setLabel('')
    setSession('race')
    setSource('alphaTiming')
    setUrl('')
    setEventId('')
    setEmailPath('')
    setManualLaps([])
    setVideoIndices([])
    setVideoOffsetFrame(0)
    setHasSetOffset(false)
    setDriver('')
  }

  function loadSegmentIntoDraft(seg: SegmentConfig, driverName: string) {
    setLabel(seg.label)
    setSession(seg.session ?? 'race')
    setSource(seg.source)
    setUrl(seg.url ?? '')
    setEventId(seg.eventId ?? '')
    setEmailPath(seg.emailPath ?? '')
    setManualLaps(seg.timingData ?? [])
    setVideoIndices(seg.videoIndices ?? [])
    setVideoOffsetFrame(seg.videoOffsetFrame ?? 0)
    setHasSetOffset(seg.videoOffsetFrame !== undefined)
    setDriver(driverName)
  }

  function changeSource(next: TimingSource) {
    setSource(next)
    setUrl('')
    setEventId('')
    setEmailPath('')
    setManualLaps([])
    setDriver('')
  }

  // Build a map of which video indices are assigned to other segments (not the one being edited)
  const assignedByOtherSegments: Record<number, string> = {}
  segments.forEach((seg, i) => {
    if (formMode?.mode === 'edit' && formMode.index === i) return
    for (const vi of seg.videoIndices ?? []) {
      assignedByOtherSegments[vi] = seg.label
    }
  })

  // Build the SegmentConfig from current draft to pass to DriverPicker
  const draftConfig = buildSegmentConfig({
    label, session, source, url, eventId, emailPath, manualLaps, videoIndices, videoOffsetFrame,
  })

  const hasTimingData =
    (source === 'alphaTiming' && url.trim() !== '') ||
    (source === 'mylapsSpeedhive' && eventId.trim() !== '') ||
    (source === 'daytonaEmail' && emailPath !== '') ||
    (source === 'teamsportEmail' && emailPath !== '') ||
    (source === 'manual' && manualLaps.length > 0 && manualLaps.every((e) => isValidLapTime(e.time)))

  const canSave =
    label.trim() !== '' &&
    videoIndices.length > 0 &&
    hasTimingData &&
    driver.trim() !== '' &&
    hasSetOffset

  function handleSave() {
    if (!canSave) return
    const seg = buildSegmentConfig({
      label, session, source, url, eventId, emailPath, manualLaps, videoIndices, videoOffsetFrame,
    })

    const newDrivers = { ...selectedDrivers, [seg.label]: driver }

    if (formMode?.mode === 'add') {
      onSegmentsChange([...segments, seg])
    } else if (formMode?.mode === 'edit') {
      const updated = [...segments]
      const oldLabel = segments[formMode.index].label
      if (oldLabel !== seg.label) {
        delete newDrivers[oldLabel]
      }
      updated[formMode.index] = seg
      onSegmentsChange(updated)
    }

    onSelectedDriversChange(newDrivers)
    setFormMode(null)
    resetForm()
  }

  function handleEdit(index: number) {
    const seg = segments[index]
    loadSegmentIntoDraft(seg, selectedDrivers[seg.label] ?? '')
    setFormMode({ mode: 'edit', index })
  }

  function handleDelete(index: number) {
    const seg = segments[index]
    const newDrivers = { ...selectedDrivers }
    delete newDrivers[seg.label]
    onSelectedDriversChange(newDrivers)
    onSegmentsChange(segments.filter((_, i) => i !== index))
  }

  function handleAddAnother() {
    resetForm()
    setFormMode({ mode: 'add' })
  }

  function handleCancelForm() {
    setFormMode(null)
    resetForm()
  }

  // All video paths assigned to this segment (for the offset picker)
  const segmentVideoPaths = videoIndices.map((i) => videoPaths[i]).filter(Boolean)

  // --- Render ---

  // Segment list + add button (no form open)
  if (formMode === null) {
    return (
      <div className="flex flex-col gap-4">
        {segments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">No segments yet</p>
            <Button onClick={handleAddAnother}>Add a segment</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {segments.map((seg, i) => (
                <SegmentRow key={seg.label} segment={seg} index={i} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </div>
            <Button variant="outline" onClick={handleAddAnother} className="self-start">
              + Add another segment
            </Button>
          </>
        )}
      </div>
    )
  }

  // Inline segment form
  return (
    <div className="flex flex-col gap-5">
      {segments.length > 0 && (
        <Button variant="ghost" size="sm" className="self-start px-0 text-xs" onClick={handleCancelForm}>
          ← Back to segments
        </Button>
      )}

      <h2 className="text-base font-semibold text-foreground">
        {formMode.mode === 'add' ? 'Add segment' : 'Edit segment'}
      </h2>

      {/* Session mode */}
      <FormField label="Session type">
        <OptionGroup options={SESSION_MODES} value={session} onValueChange={setSession} />
      </FormField>

      {/* Segment label */}
      <FormField label="Segment label">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Race 1" />
      </FormField>

      {/* Video assignment */}
      <VideoSelector
        videoPaths={videoPaths}
        selectedIndices={videoIndices}
        onChange={setVideoIndices}
        assignedByOtherSegments={assignedByOtherSegments}
      />

      {/* Timing source */}
      <FormField label="Timing source">
        <OptionGroup options={TIMING_SOURCES} value={source} onValueChange={changeSource} />
      </FormField>

      <SourceFields
        source={source}
        url={url}
        setUrl={setUrl}
        eventId={eventId}
        setEventId={setEventId}
        emailPath={emailPath}
        setEmailPath={setEmailPath}
      />

      {source === 'manual' && (
        <>
          <ManualLapSummary manualLaps={manualLaps} onEdit={() => setShowLapDialog(true)} />
          <ManualLapDialog
            open={showLapDialog}
            onOpenChange={setShowLapDialog}
            manualLaps={manualLaps}
            setManualLaps={setManualLaps}
          />
        </>
      )}

      {/* Driver selection — appears after timing data is provided */}
      {hasTimingData && (
        <DriverPicker
          segment={draftConfig}
          selectedDriver={driver}
          onDriverChange={setDriver}
        />
      )}

      {/* Offset picker — inline */}
      {videoIndices.length > 0 && (
        <InlineOffsetPicker
          videoPaths={segmentVideoPaths}
          currentFrame={videoOffsetFrame}
          onFrameChange={(frame) => { setVideoOffsetFrame(frame); setHasSetOffset(true) }}
        />
      )}

      {/* Save / cancel */}
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={!canSave}>
          {formMode.mode === 'add' ? 'Add segment' : 'Save changes'}
        </Button>
        {segments.length > 0 && (
          <Button variant="ghost" onClick={handleCancelForm}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
