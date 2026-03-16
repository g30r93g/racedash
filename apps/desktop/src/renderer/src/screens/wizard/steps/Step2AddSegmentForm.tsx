import React, { useRef, useState } from 'react'
import type { SegmentConfig, TimingSource, SessionMode } from '../../../../../types/project'
import { Step2OffsetPicker } from './Step2OffsetPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { FileUpload } from '@/components/app/FileUpload'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface Step2AddSegmentFormProps {
  videoPaths: string[]
  initial?: SegmentConfig
  mode: 'add' | 'edit'
  onSave: (segment: SegmentConfig) => void
  onBack: () => void
}

const TIMING_SOURCES: { value: TimingSource; label: string }[] = [
  { value: 'alphaTiming', label: 'Alpha Timing' },
  { value: 'daytonaEmail', label: 'Daytona' },
  { value: 'mylapsSpeedhive', label: 'SpeedHive' },
  { value: 'teamsportEmail', label: 'TeamSport' },
  { value: 'manual', label: 'Manual' },
]

const SPEEDHIVE_SESSIONS: { value: SessionMode; label: string }[] = [
  { value: 'race', label: 'Race' },
  { value: 'qualifying', label: 'Qualifying' },
  { value: 'practice', label: 'Practice' },
]

export function Step2AddSegmentForm({
  videoPaths,
  initial,
  mode,
  onSave,
  onBack,
}: Step2AddSegmentFormProps) {
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
      ...(source === 'alphaTiming' ? { url } : {}),
      ...(source === 'mylapsSpeedhive' ? { eventId, session, sessionName: sessionName || undefined } : {}),
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
        videoPath={videoPaths[0] ?? ''}
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

        <FormField label="Timing source">
          <ToggleGroup
            type="single"
            value={source}
            onValueChange={(val) => { if (val) changeSource(val as TimingSource) }}
            className="flex flex-wrap gap-2"
          >
            {TIMING_SOURCES.map((ts) => (
              <ToggleGroupItem
                key={ts.value}
                value={ts.value}
                className="rounded-full border px-3.5 py-1 text-xs font-medium data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {ts.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FormField>

        {source === 'alphaTiming' && (
          <FormField label="Results URL">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </FormField>
        )}

        {source === 'mylapsSpeedhive' && (
          <>
            <FormField label="Event ID">
              <Input
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                placeholder="123456"
              />
            </FormField>
            <FormField label="Session">
              <Select value={session} onChange={(e) => setSession(e.target.value as SessionMode)}>
                {SPEEDHIVE_SESSIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Session name" hint="(optional)">
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Sprint Race"
              />
            </FormField>
          </>
        )}

        {source === 'daytonaEmail' && (
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
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Race"
              />
            </FormField>
          </>
        )}

        {source === 'teamsportEmail' && (
          <FormField label="Results file">
            <FileUpload
              accept={['eml']}
              onFile={setEmailPath}
              value={emailPath}
              placeholder="Drop file here or browse"
              hint=".eml email export from TeamSport"
            />
          </FormField>
        )}

        {source === 'manual' && (
          <p className="rounded-lg border border-border bg-accent/40 px-4 py-3 text-sm text-muted-foreground">
            No timing file needed. Lap times and positions will be entered manually in the editor
            once the project is created.
          </p>
        )}

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOffsetPicker(true)}
            disabled={videoPaths.length === 0}
          >
            Set in video
          </Button>
        </div>

        <Button onClick={handleSave} disabled={!label.trim()} className="self-start">
          {mode === 'add' ? 'Add segment' : 'Save changes'}
        </Button>
      </div>
    </>
  )
}
