import { InfoRow } from '@/components/app/InfoRow'
import { SectionLabel } from '@/components/app/SectionLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OptionGroup } from '@/components/ui/option-group'
import { Progress } from '@/components/ui/progress'
import React, { useEffect, useRef, useState } from 'react'
import type {
  OutputFrameRate,
  OutputResolution,
  RenderCompleteResult,
  RenderMode,
  VideoInfo,
} from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import type { OverlayType } from './OverlayPickerModal'

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
  onRenderingChange?: (rendering: boolean) => void
  overlayType: OverlayType
}

interface LastRender {
  status: 'completed' | 'error'
  outputPath: string
  timestamp: Date
}

export function ExportTab({ project, videoInfo, onRenderingChange, overlayType }: ExportTabProps): React.ReactElement {
  const defaultOutputPath = `${dirname(project.projectPath)}/output.mp4`
  const [outputPath, setOutputPath] = useState(defaultOutputPath)
  const [outputResolution, setOutputResolution] = useState<OutputResolution>('source')
  const [outputFrameRate, setOutputFrameRate] = useState<OutputFrameRate>('source')
  const [renderMode, setRenderMode] = useState<RenderMode>('overlay+footage')
  const [rendering, setRendering] = useState(false)
  const [renderPhase, setRenderPhase] = useState('')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderFrames, setRenderFrames] = useState<{ rendered: number; total: number } | null>(null)
  const [lastRender, setLastRender] = useState<LastRender | null>(null)

  const cleanupRef = useRef<Array<() => void>>([])
  useEffect(() => {
    return () => { cleanupRef.current.forEach((fn) => fn()) }
  }, [])

  async function handleBrowse() {
    const dir = await window.racedash.openDirectory({ title: 'Choose output folder' })
    if (dir) setOutputPath(`${dir}/output.mp4`)
  }

  function startRendering() {
    setRendering(true)
    onRenderingChange?.(true)
  }

  function stopRendering() {
    setRendering(false)
    onRenderingChange?.(false)
  }

  async function handleRender() {
    startRendering()
    setRenderPhase('Starting…')
    setRenderProgress(0)
    setRenderFrames(null)
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []

    cleanupRef.current.push(
      window.racedash.onRenderProgress((event) => {
        setRenderPhase(event.phase)
        setRenderProgress(event.progress)
        if (event.renderedFrames != null && event.totalFrames != null) {
          setRenderFrames({ rendered: event.renderedFrames, total: event.totalFrames })
        }
      })
    )
    cleanupRef.current.push(
      window.racedash.onRenderComplete((result: RenderCompleteResult) => {
        stopRendering()
        setLastRender({ status: 'completed', outputPath: result.outputPath, timestamp: new Date() })
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      })
    )
    cleanupRef.current.push(
      window.racedash.onRenderError((err) => {
        stopRendering()
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
        style: overlayType,
        outputResolution,
        outputFrameRate,
        renderMode,
      })
    } catch (err) {
      stopRendering()
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

  const shimmerStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, #6e6e6e 0%, #6e6e6e 25%, #e8e8e8 45%, #ffffff 50%, #e8e8e8 55%, #6e6e6e 75%, #6e6e6e 100%)',
    backgroundSize: '400% 100%',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    animation: 'shimmer 3.5s linear infinite',
  }

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
        <OptionGroup options={resolutionOptions} value={outputResolution} onValueChange={setOutputResolution} disabled={rendering} />
      </section>

      {/* OUTPUT FRAME RATE */}
      <section>
        <SectionLabel>Output Frame Rate</SectionLabel>
        <OptionGroup options={frameRateOptions} value={outputFrameRate} onValueChange={setOutputFrameRate} disabled={rendering} />
      </section>

      {/* OUTPUT PATH */}
      <section>
        <SectionLabel>Output Path</SectionLabel>
        <div className="flex items-center gap-2">
          <Input
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            className="min-w-0 flex-1 font-mono text-xs"
            disabled={rendering}
          />
          <Button variant="outline" size="sm" onClick={handleBrowse} disabled={rendering}>Browse</Button>
        </div>
      </section>

      {/* RENDER MODE */}
      <section>
        <SectionLabel>Render Mode</SectionLabel>
        <OptionGroup options={renderModeOptions} value={renderMode} onValueChange={setRenderMode} disabled={rendering} />
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
        ) : renderProgress === 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Starting render job</span>
            </div>
            <Button variant="outline" onClick={() => window.racedash.cancelRender()}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span style={shimmerStyle}>{renderPhase}</span>
              <span>{Math.round(renderProgress * 100)}%</span>
            </div>
            <Progress value={Math.round(renderProgress * 100)} />
            {renderFrames && (
              <p className="text-[10px] text-muted-foreground">
                Frame {renderFrames.rendered} of {renderFrames.total}
              </p>
            )}
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
