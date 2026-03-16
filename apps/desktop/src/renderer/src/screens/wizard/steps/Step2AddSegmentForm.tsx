import React, { useRef, useState } from 'react'
import type { SegmentConfig, TimingSource, SessionMode } from '../../../../../types/project'
import { Step2OffsetPicker } from './Step2OffsetPicker'
import { cn } from '@/lib/utils'

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
  const [videoOffsetFrame, setVideoOffsetFrame] = useState<number | undefined>(
    initial?.videoOffsetFrame
  )
  const [showOffsetPicker, setShowOffsetPicker] = useState(false)

  const labelRef = useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    labelRef.current?.focus()
  }, [])

  async function handleBrowseEmailFile(accepts: string[]) {
    const path = await window.racedash.openFile({
      filters: [{ name: 'Result files', extensions: accepts }],
    })
    if (path) setEmailPath(path)
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

  const canSave = label.trim().length > 0

  return (
    <>
      {showOffsetPicker && videoPaths.length > 0 && (
        <Step2OffsetPicker
          segmentLabel={label || 'Segment'}
          videoPath={videoPaths[0]}
          initialFrame={videoOffsetFrame ?? 0}
          onConfirm={(frame) => {
            setVideoOffsetFrame(frame)
            setShowOffsetPicker(false)
          }}
          onCancel={() => setShowOffsetPicker(false)}
        />
      )}

      <div className="flex flex-col gap-5">
        <button type="button" onClick={onBack} className="self-start text-xs text-muted-foreground hover:text-foreground">
          ← Segments
        </button>

        <h2 className="text-base font-semibold text-foreground">
          {mode === 'add' ? 'Add segment' : 'Edit segment'}
        </h2>

        {/* Label */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Segment label
          </label>
          <input
            ref={labelRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Race"
            className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>

        {/* Timing source pills */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Timing source
          </label>
          <div className="flex flex-wrap gap-2">
            {TIMING_SOURCES.map((ts) => (
              <button
                key={ts.value}
                type="button"
                onClick={() => setSource(ts.value)}
                className={cn(
                  'rounded-full border px-3.5 py-1 text-xs font-medium transition-colors',
                  source === ts.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                {ts.label}
              </button>
            ))}
          </div>
        </div>

        {/* Alpha Timing */}
        {source === 'alphaTiming' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Results URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        )}

        {/* SpeedHive */}
        {source === 'mylapsSpeedhive' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Event ID</label>
              <input
                type="text"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                placeholder="123456"
                className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Session</label>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value as SessionMode)}
                className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {SPEEDHIVE_SESSIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Session name <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Sprint Race"
                className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </>
        )}

        {/* Daytona */}
        {source === 'daytonaEmail' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Results file
              </label>
              <div
                role="button"
                tabIndex={0}
                className="flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/50"
                onClick={() => handleBrowseEmailFile(['eml', 'txt'])}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleBrowseEmailFile(['eml', 'txt']) }}
              >
                {emailPath ? (
                  <p className="text-sm text-foreground">{emailPath.split('/').pop()}</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Drop file here or browse</p>
                    <p className="text-xs text-muted-foreground">.eml or .txt email export from Daytona</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Session name <span className="text-muted-foreground/60">(optional)</span>
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Race"
                className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </>
        )}

        {/* TeamSport */}
        {source === 'teamsportEmail' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Results file
            </label>
            <div
              role="button"
              tabIndex={0}
              className="flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/50"
              onClick={() => handleBrowseEmailFile(['eml'])}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleBrowseEmailFile(['eml']) }}
            >
              {emailPath ? (
                <p className="text-sm text-foreground">{emailPath.split('/').pop()}</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Drop file here or browse</p>
                  <p className="text-xs text-muted-foreground">.eml email export from TeamSport</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Manual */}
        {source === 'manual' && (
          <div className="rounded-lg border border-border bg-accent/40 px-4 py-3 text-sm text-muted-foreground">
            No timing file needed. Lap times and positions will be entered manually in the editor
            once the project is created.
          </div>
        )}

        {/* Video offset */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Video offset
              </p>
              <p className="text-sm text-foreground">
                {videoOffsetFrame !== undefined
                  ? `Frame ${videoOffsetFrame}`
                  : 'Not set — pick a frame to sync timing'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowOffsetPicker(true)}
            disabled={videoPaths.length === 0}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Set in video
          </button>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="self-start rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          {mode === 'add' ? 'Add segment' : 'Save changes'}
        </button>
      </div>
    </>
  )
}
