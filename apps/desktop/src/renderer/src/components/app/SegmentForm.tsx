import React, { useRef, useState } from 'react'
import type { SegmentConfig, TimingSource, SessionMode } from '../../../../types/project'
import { Step2OffsetPicker } from '@/screens/wizard/steps/Step2OffsetPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { FileUpload } from '@/components/app/FileUpload'
import { OptionGroup } from '@/components/ui/option-group'

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SourceFieldsProps {
  source: TimingSource
  url: string
  setUrl: (v: string) => void
  eventId: string
  setEventId: (v: string) => void
  sessionName: string
  setSessionName: (v: string) => void
  emailPath: string
  setEmailPath: (v: string) => void
}

function SourceFields({
  source, url, setUrl,
  eventId, setEventId,
  sessionName, setSessionName,
  emailPath, setEmailPath,
}: SourceFieldsProps) {
  if (source === 'alphaTiming') {
    return (
      <FormField label="Results URL">
        <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
      </FormField>
    )
  }

  if (source === 'mylapsSpeedhive') {
    return (
      <>
        <FormField label="Event ID">
          <Input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="123456" />
        </FormField>
        <FormField label="Session name" hint="(optional)">
          <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g. Sprint Race" />
        </FormField>
      </>
    )
  }

  if (source === 'daytonaEmail') {
    return (
      <>
        <FormField label="Results file">
          <FileUpload
            accept={['eml', 'txt']}
            onFile={setEmailPath}
            value={emailPath}
            placeholder="Drop file here or browse"
            hint=".eml or .txt email export from Daytona"
          />
        </FormField>
        <FormField label="Session name" hint="(optional)">
          <Input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g. Race" />
        </FormField>
      </>
    )
  }

  if (source === 'teamsportEmail') {
    return (
      <FormField label="Results file">
        <FileUpload
          accept={['eml']}
          onFile={setEmailPath}
          value={emailPath}
          placeholder="Drop file here or browse"
          hint=".eml email export from TeamSport"
        />
      </FormField>
    )
  }

  if (source === 'manual') {
    return (
      <p className="rounded-lg border border-border bg-accent/40 px-4 py-3 text-sm text-muted-foreground">
        No timing file needed. Lap times and positions will be entered manually in the editor
        once the project is created.
      </p>
    )
  }

  return null
}

interface VideoOffsetFieldProps {
  videoOffsetFrame: number | undefined
  disabled: boolean
  onPick: () => void
}

function VideoOffsetField({ videoOffsetFrame, disabled, onPick }: VideoOffsetFieldProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Video offset
        </p>
        <p className="mt-0.5 text-sm text-foreground">
          {videoOffsetFrame !== undefined
            ? `Frame ${videoOffsetFrame}`
            : 'Not set — pick a frame to sync timing'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onPick} disabled={disabled}>
        Set in video
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SegmentForm
// ---------------------------------------------------------------------------

export interface SegmentFormProps {
  videoPaths: string[]
  joinedVideoPath?: string
  initial?: SegmentConfig
  mode: 'add' | 'edit'
  onSave: (segment: SegmentConfig) => void
  onBack: () => void
}

export function SegmentForm({ videoPaths, joinedVideoPath, initial, mode, onSave, onBack }: SegmentFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [source, setSource] = useState<TimingSource>(initial?.source ?? 'alphaTiming')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [eventId, setEventId] = useState(initial?.eventId ?? '')
  const [session, setSession] = useState<SessionMode>(initial?.session ?? 'race')
  const [sessionName, setSessionName] = useState(initial?.sessionName ?? '')
  const [emailPath, setEmailPath] = useState(initial?.emailPath ?? '')
  const [videoOffsetFrame, setVideoOffsetFrame] = useState<number | undefined>(initial?.videoOffsetFrame)
  const [showOffsetPicker, setShowOffsetPicker] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => { labelRef.current?.focus() }, [])

  function changeSource(next: TimingSource) {
    setSource(next)
    setUrl('')
    setEventId('')
    setSession('race')
    setSessionName('')
    setEmailPath('')
  }

  function handleSave() {
    if (!label.trim()) return
    const seg: SegmentConfig = {
      label: label.trim(),
      source,
      session,
      ...(source === 'alphaTiming' ? { url } : {}),
      ...(source === 'mylapsSpeedhive' ? { eventId, sessionName: sessionName || undefined } : {}),
      ...(source === 'daytonaEmail' ? { emailPath, sessionName: sessionName || undefined } : {}),
      ...(source === 'teamsportEmail' ? { emailPath } : {}),
      ...(videoOffsetFrame !== undefined ? { videoOffsetFrame } : {}),
    }
    onSave(seg)
  }

  return (
    <>
      <Step2OffsetPicker
        open={showOffsetPicker && videoPaths.length > 0}
        onOpenChange={setShowOffsetPicker}
        segmentLabel={label || 'Segment'}
        videoPath={joinedVideoPath ?? videoPaths[0] ?? ''}
        initialFrame={videoOffsetFrame ?? 0}
        onConfirm={(frame) => setVideoOffsetFrame(frame)}
      />

      <div className="flex flex-col gap-5">
        <Button variant="ghost" size="sm" className="self-start px-0 text-xs" onClick={onBack}>
          ← Segments
        </Button>

        <h2 className="text-base font-semibold text-foreground">
          {mode === 'add' ? 'Add segment' : 'Edit segment'}
        </h2>

        <FormField label="Segment label">
          <Input
            ref={labelRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Race"
          />
        </FormField>

        <FormField label="Segment mode">
          <OptionGroup options={SESSION_MODES} value={session} onValueChange={setSession} />
        </FormField>

        <FormField label="Timing source">
          <OptionGroup options={TIMING_SOURCES} value={source} onValueChange={changeSource} />
        </FormField>

        <SourceFields
          source={source}
          url={url} setUrl={setUrl}
          eventId={eventId} setEventId={setEventId}
          sessionName={sessionName} setSessionName={setSessionName}
          emailPath={emailPath} setEmailPath={setEmailPath}
        />

        <VideoOffsetField
          videoOffsetFrame={videoOffsetFrame}
          disabled={videoPaths.length === 0}
          onPick={() => setShowOffsetPicker(true)}
        />

        <Button onClick={handleSave} disabled={!label.trim()} className="self-start">
          {mode === 'add' ? 'Add segment' : 'Save changes'}
        </Button>
      </div>
    </>
  )
}
