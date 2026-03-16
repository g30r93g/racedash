import React, { useEffect, useRef, useState } from 'react'
import type {
  OutputFrameRate,
  OutputResolution,
  RenderCompleteResult,
  RenderMode,
  VideoInfo,
} from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatFps(fps: number): string {
  return Number.isInteger(fps) ? `${fps} fps` : `${fps.toFixed(2)} fps`
}

function formatResolution(w: number, h: number): string {
  return `${w} × ${h}`
}

function formatTime(date: Date): string {
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return isToday
    ? `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleDateString()
}

/** Extract directory from an absolute path without node:path (renderer-safe). */
function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(0, i) : '.'
}

// ── sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  )
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  )
}

interface ToggleGroupProps<T extends string> {
  options: Array<{ value: T; label: string; disabled?: boolean }>
  value: T
  onChange: (v: T) => void
}

function ToggleGroup<T extends string>({ options, value, onChange }: ToggleGroupProps<T>): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={[
            'rounded px-3 py-1 text-xs transition-colors',
            value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-accent text-muted-foreground hover:text-foreground',
            o.disabled ? 'cursor-not-allowed opacity-40' : '',
          ].filter(Boolean).join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

interface ExportTabProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
}

interface LastRender {
  status: 'completed' | 'error'
  outputPath: string
  timestamp: Date
}

export function ExportTab({ project, videoInfo }: ExportTabProps): React.ReactElement {
  const defaultOutputPath = `${dirname(project.projectPath)}/output.mp4`
  const [outputPath, setOutputPath] = useState(defaultOutputPath)
  const [outputResolution, setOutputResolution] = useState<OutputResolution>('source')
  const [outputFrameRate, setOutputFrameRate] = useState<OutputFrameRate>('source')
  const [renderMode, setRenderMode] = useState<RenderMode>('overlay+footage')
  const [rendering, setRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState('')
  const [renderProgress, setRenderProgress] = useState(0)
  const [lastRender, setLastRender] = useState<LastRender | null>(null)

  const cleanupRef = useRef<Array<() => void>>([])
  useEffect(() => {
    return () => { cleanupRef.current.forEach((fn) => fn()) }
  }, [])

  async function handleBrowse() {
    const dir = await window.racedash.openDirectory({ title: 'Choose output folder' })
    if (dir) setOutputPath(`${dir}/output.mp4`)
  }

  async function handleRender() {
    setRendering(true)
    setRenderPhase('Starting…')
    setRenderProgress(0)
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []

    cleanupRef.current.push(
      window.racedash.onRenderProgress((event) => {
        setRenderPhase(event.phase)
        setRenderProgress(event.progress)
      })
    )
    cleanupRef.current.push(
      window.racedash.onRenderComplete((result: RenderCompleteResult) => {
        setRendering(false)
        setLastRender({ status: 'completed', outputPath: result.outputPath, timestamp: new Date() })
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      })
    )
    cleanupRef.current.push(
      window.racedash.onRenderError((err) => {
        setRendering(false)
        setLastRender({ status: 'error', outputPath, timestamp: new Date() })
        console.error('Render error:', err.message)
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      })
    )

    try {
      await window.racedash.startRender({
        configPath: project.projectPath,
        videoPaths: project.videoPaths,
        outputPath,
        style: 'banner', // TODO: derive from StyleTab state once lifted to parent
        outputResolution,
        outputFrameRate,
        renderMode,
      })
    } catch (err) {
      setRendering(false)
      setLastRender({ status: 'error', outputPath, timestamp: new Date() })
      console.error('startRender threw:', err)
    }
  }

  const resolutionOptions: Array<{ value: OutputResolution; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '1080p', label: '1080p' },
    { value: '1440p', label: '1440p' },
    { value: '2160p', label: '4K ⚡', disabled: true },
  ]
  const frameRateOptions: Array<{ value: OutputFrameRate; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' },
    { value: '120', label: '120 fps ⚡', disabled: true },
  ]
  const renderModeOptions: Array<{ value: RenderMode; label: string }> = [
    { value: 'overlay+footage', label: 'Overlay + Footage' },
    { value: 'overlay-only', label: 'Overlay Only' },
  ]

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* SOURCE VIDEO */}
      <section>
        <SectionLabel>Source Video</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <InfoRow
            label="Resolution"
            value={videoInfo ? formatResolution(videoInfo.width, videoInfo.height) : '—'}
          />
          <div className="border-t border-border" />
          <InfoRow label="Frame rate" value={videoInfo ? formatFps(videoInfo.fps) : '—'} />
        </div>
      </section>

      {/* OUTPUT RESOLUTION */}
      <section>
        <SectionLabel>Output Resolution</SectionLabel>
        <ToggleGroup options={resolutionOptions} value={outputResolution} onChange={setOutputResolution} />
      </section>

      {/* OUTPUT FRAME RATE */}
      <section>
        <SectionLabel>Output Frame Rate</SectionLabel>
        <ToggleGroup options={frameRateOptions} value={outputFrameRate} onChange={setOutputFrameRate} />
      </section>

      {/* OUTPUT PATH */}
      <section>
        <SectionLabel>Output Path</SectionLabel>
        <div className="flex items-center gap-2">
          <Input
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <Button variant="outline" size="sm" onClick={handleBrowse}>Browse</Button>
        </div>
      </section>

      {/* RENDER MODE */}
      <section>
        <SectionLabel>Render Mode</SectionLabel>
        <ToggleGroup options={renderModeOptions} value={renderMode} onChange={setRenderMode} />
      </section>

      {/* RENDER BUTTON */}
      <section>
        {!rendering ? (
          <Button onClick={handleRender} className="w-full gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Render
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{renderPhase}</span>
              <span>{Math.round(renderProgress * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(renderProgress * 100)}%` }}
              />
            </div>
            <Button variant="outline" onClick={() => window.racedash.cancelRender()}>
              Cancel
            </Button>
          </div>
        )}
      </section>

      {/* LAST RENDER */}
      {lastRender && (
        <section>
          <SectionLabel>Last Render</SectionLabel>
          <div className="flex items-center gap-3 rounded-md border border-border bg-accent px-3 py-2">
            <div className={[
              'h-2 w-2 shrink-0 rounded-full',
              lastRender.status === 'completed' ? 'bg-green-500' : 'bg-destructive',
            ].join(' ')} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-foreground">
                {lastRender.status === 'completed' ? 'Completed' : 'Failed'}
              </span>
              <span className="text-[10px] text-muted-foreground">{formatTime(lastRender.timestamp)}</span>
            </div>
            {lastRender.status === 'completed' && (
              <button
                onClick={() => window.racedash.revealInFinder(lastRender.outputPath)}
                className="shrink-0 text-xs text-primary hover:underline"
              >
                Show in Finder
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
