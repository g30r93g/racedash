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
import { SectionLabel } from '@/components/app/SectionLabel'
import { InfoRow } from '@/components/app/InfoRow'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Progress } from '@/components/ui/progress'

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
        configPath: project.configPath,
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
        <ToggleGroup
          type="single"
          value={outputResolution}
          onValueChange={(val) => { if (val) setOutputResolution(val as OutputResolution) }}
          className="flex flex-wrap gap-1"
        >
          {resolutionOptions.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              disabled={o.disabled}
              className="rounded px-3 py-1 text-xs"
            >
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      {/* OUTPUT FRAME RATE */}
      <section>
        <SectionLabel>Output Frame Rate</SectionLabel>
        <ToggleGroup
          type="single"
          value={outputFrameRate}
          onValueChange={(val) => { if (val) setOutputFrameRate(val as OutputFrameRate) }}
          className="flex flex-wrap gap-1"
        >
          {frameRateOptions.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              disabled={o.disabled}
              className="rounded px-3 py-1 text-xs"
            >
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
        <ToggleGroup
          type="single"
          value={renderMode}
          onValueChange={(val) => { if (val) setRenderMode(val as RenderMode) }}
          className="flex flex-wrap gap-1"
        >
          {renderModeOptions.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              className="rounded px-3 py-1 text-xs"
            >
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
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
            <Progress value={Math.round(renderProgress * 100)} />
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
              <Button
                variant="link"
                size="sm"
                onClick={() => window.racedash.revealInFinder(lastRender.outputPath)}
                className="shrink-0 p-0 text-xs"
              >
                Show in Finder
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
