import { InfoRow } from '@/components/app/InfoRow'
import { SectionLabel } from '@/components/app/SectionLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { OptionGroup } from '@/components/ui/option-group'
import { Progress } from '@/components/ui/progress'
import { hasCloudLicense } from '@/lib/license'
import React, { useEffect, useRef, useState } from 'react'
import type {
  CloudUploadProgressEvent,
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

/** Extract directory from an absolute path without node:path (renderer-safe). */
function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(0, i) : '.'
}

type RenderDestination = 'local' | 'cloud'

// ── component ─────────────────────────────────────────────────────────────────

interface ExportTabProps {
  project: ProjectData
  videoInfo?: VideoInfo | null
  onRenderingChange?: (rendering: boolean) => void
  overlayType: OverlayType
  authUser?: { name: string } | null
  licenseTier?: 'plus' | 'pro' | null
  onSignIn?: () => void
}

interface LastRender {
  status: 'completed' | 'error'
  outputPath: string
  timestamp: Date
}

export function ExportTab({ project, videoInfo, onRenderingChange, overlayType, authUser, licenseTier, onSignIn }: ExportTabProps): React.ReactElement {
  const licensed = hasCloudLicense(licenseTier)
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
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null)

  // Cloud render state
  const [renderDestination, setRenderDestination] = useState<RenderDestination>(licensed ? 'cloud' : 'local')
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [cloudUploading, setCloudUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<CloudUploadProgressEvent | null>(null)

  const renderStartRef = useRef<number>(0)
  const cleanupRef = useRef<Array<() => void>>([])
  useEffect(() => {
    return () => { cleanupRef.current.forEach((fn) => fn()) }
  }, [])

  // Fetch credit balance when cloud destination is selected
  useEffect(() => {
    if (renderDestination === 'cloud' && authUser) {
      window.racedash.credits.getBalance().then((b) => setCreditBalance(b.totalRc)).catch(() => {})
    }
  }, [renderDestination, authUser])

  // Compute estimated cost when cloud is selected and video info is available
  useEffect(() => {
    if (renderDestination === 'cloud' && videoInfo) {
      window.racedash.cloudRender.estimateCost(videoInfo, outputResolution, outputFrameRate)
        .then(setEstimatedCost)
        .catch(() => {})
    }
  }, [renderDestination, videoInfo, outputResolution, outputFrameRate])

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
    setEtaSeconds(null)
    renderStartRef.current = Date.now()
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []

    cleanupRef.current.push(
      window.racedash.onRenderProgress((event) => {
        setRenderPhase(event.phase)
        setRenderProgress(event.progress)
        if (event.renderedFrames != null && event.totalFrames != null) {
          setRenderFrames({ rendered: event.renderedFrames, total: event.totalFrames })
        }
        if (event.progress > 0.02) {
          const elapsed = (Date.now() - renderStartRef.current) / 1000
          const remaining = (elapsed / event.progress) * (1 - event.progress)
          setEtaSeconds(remaining)
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

  async function handleCloudRender() {
    if (!videoInfo) return
    setCloudUploading(true)
    setUploadProgress(null)

    // Listen for upload progress events
    const cleanupProgress = window.racedash.onCloudUploadProgress((event) => {
      setUploadProgress(event)
    })
    const cleanupComplete = window.racedash.onCloudUploadComplete(() => {
      setCloudUploading(false)
      setUploadProgress(null)
      cleanupProgress()
      cleanupComplete()
      cleanupError()
    })
    const cleanupError = window.racedash.onCloudUploadError((event) => {
      setCloudUploading(false)
      setUploadProgress(null)
      console.error('Cloud upload error:', event.message)
      cleanupProgress()
      cleanupComplete()
      cleanupError()
    })

    try {
      // Join chapters if needed
      const joinResult = await window.racedash.joinVideos(project.videoPaths)
      const filePath = joinResult.joinedPath
      const fileSizeBytes = await window.racedash.cloudRender.getFileSize(filePath)

      // Create job
      const config = await window.racedash.readProjectConfig(project.configPath)
      const { jobId } = await window.racedash.cloudRender.createJob({
        config: {
          resolution: outputResolution,
          frameRate: outputFrameRate,
          renderMode,
          overlayStyle: overlayType,
          config,
        },
        sourceVideo: { ...videoInfo, fileSizeBytes },
        projectName: project.name,
        sessionType: 'race',
      })

      // Start multipart upload
      const partSize = 10_485_760 // 10 MB
      const partCount = Math.ceil(fileSizeBytes / partSize)
      const { uploadId, presignedUrls } = await window.racedash.cloudRender.startUpload(jobId, {
        partCount,
        partSize,
        contentType: 'video/mp4',
      })

      // Upload parts with concurrency of 4
      const parts: Array<{ partNumber: number; etag: string }> = []
      const concurrency = 4
      let nextPart = 0

      const uploadNextPart = async (): Promise<void> => {
        while (nextPart < presignedUrls.length) {
          const idx = nextPart++
          const { partNumber, url } = presignedUrls[idx]
          const offset = (partNumber - 1) * partSize
          const size = Math.min(partSize, fileSizeBytes - offset)
          const result = await window.racedash.cloudRender.uploadPart(jobId, url, filePath, partNumber, offset, size)
          parts.push(result)
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, partCount) }, () => uploadNextPart())
      await Promise.all(workers)

      // Sort parts by partNumber for the complete call
      parts.sort((a, b) => a.partNumber - b.partNumber)

      // Complete upload
      await window.racedash.cloudRender.completeUpload(jobId, parts)

      setCloudUploading(false)
      setUploadProgress(null)
    } catch (err) {
      setCloudUploading(false)
      setUploadProgress(null)
      console.error('Cloud render failed:', err)
    }

    cleanupProgress()
    cleanupComplete()
    cleanupError()
  }

  const resolutionOptions: Array<{ value: OutputResolution; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '1080p', label: '1080p' },
    { value: '1440p', label: '1440p' },
    { value: '2160p', label: licensed ? '4K' : '4K ⚡', disabled: !licensed },
  ]
  const frameRateOptions: Array<{ value: OutputFrameRate; label: string; disabled?: boolean }> = [
    { value: 'source', label: 'Source' },
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' },
    { value: '120', label: licensed ? '120 fps' : '120 fps ⚡', disabled: !licensed },
  ]
  const renderModeOptions: Array<{ value: RenderMode; label: string }> = [
    { value: 'overlay+footage', label: 'Overlay + Footage' },
    { value: 'overlay-only', label: 'Overlay Only' },
  ]
  const destinationOptions: Array<{ value: RenderDestination; label: string }> = [
    { value: 'local', label: 'Local' },
    { value: 'cloud', label: 'Cloud' },
  ]

  const shimmerStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, #6e6e6e 0%, #6e6e6e 25%, #e8e8e8 45%, #ffffff 50%, #e8e8e8 55%, #6e6e6e 75%, #6e6e6e 100%)',
    backgroundSize: '400% 100%',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    animation: 'shimmer 3.5s linear infinite',
  }

  const isCloudDisabled = !authUser || !licenseTier || (estimatedCost !== null && creditBalance !== null && creditBalance < estimatedCost)
  const isBusy = rendering || cloudUploading

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

      {/* RENDER DESTINATION */}
      <section>
        <SectionLabel>Render Destination</SectionLabel>
        <OptionGroup options={destinationOptions} value={renderDestination} onValueChange={setRenderDestination as (v: string) => void} disabled={isBusy} />
      </section>

      {/* OUTPUT RESOLUTION */}
      <section>
        <SectionLabel>Output Resolution</SectionLabel>
        <OptionGroup options={resolutionOptions} value={outputResolution} onValueChange={setOutputResolution} disabled={isBusy} />
      </section>

      {/* OUTPUT FRAME RATE */}
      <section>
        <SectionLabel>Output Frame Rate</SectionLabel>
        <OptionGroup options={frameRateOptions} value={outputFrameRate} onValueChange={setOutputFrameRate} disabled={isBusy} />
      </section>

      {/* RENDER MODE */}
      <section>
        <SectionLabel>Render Mode</SectionLabel>
        <OptionGroup options={renderModeOptions} value={renderMode} onValueChange={setRenderMode} disabled={isBusy} />
      </section>

      {/* OUTPUT PATH (local only) */}
      {renderDestination === 'local' && (
        <section>
          <SectionLabel>Output Path</SectionLabel>
          <div className="flex items-center gap-2">
            <Input
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              className="min-w-0 flex-1 font-mono text-xs"
              disabled={isBusy}
            />
            <Button variant="outline" size="sm" onClick={handleBrowse} disabled={isBusy}>Browse</Button>
          </div>
        </section>
      )}

      {/* CLOUD RENDER INFO */}
      {renderDestination === 'cloud' && (
        <section>
          <SectionLabel>Cloud Render</SectionLabel>
          {!authUser ? (
            <div className="rounded-md border border-border bg-accent px-3 py-3">
              <p className="text-xs text-muted-foreground">Sign in to use cloud rendering</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={onSignIn}>Sign in</Button>
            </div>
          ) : !licenseTier ? (
            <div className="rounded-md border border-border bg-accent px-3 py-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Subscription required:</span> Cloud rendering requires a RaceDash Cloud subscription
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-accent px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Estimated cost</span>
                <span className="text-xs font-medium">{estimatedCost ?? '—'} RC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Credit balance</span>
                <span className="text-xs font-medium">{creditBalance ?? '—'} RC remaining</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Concurrent slots</span>
                <span className="text-xs font-medium">{licenseTier === 'pro' ? 3 : 1}</span>
              </div>
              {videoInfo && videoInfo.durationSeconds * 2_500_000 > 500 * 1024 * 1024 && (
                <p className="text-[10px] text-amber-600">
                  Large file — upload may take several minutes on a typical connection
                </p>
              )}
              {licenseTier === 'plus' && (
                <p className="text-[10px] text-muted-foreground">
                  Upgrade to Pro for 3 concurrent render slots
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* RENDER / SUBMIT BUTTON */}
      <section>
        {renderDestination === 'local' ? (
          <>
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
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  {renderFrames && (
                    <span>Frame {renderFrames.rendered} of {renderFrames.total}</span>
                  )}
                  {etaSeconds != null && (
                    <span className={renderFrames ? '' : 'ml-auto'}>{formatDuration(etaSeconds)} remaining</span>
                  )}
                </div>
                <Button variant="outline" onClick={() => window.racedash.cancelRender()}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            {!cloudUploading ? (
              <Button onClick={handleCloudRender} className="w-full gap-2" disabled={isCloudDisabled}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 16V8m0 0l-3 3m3-3l3 3" />
                  <path d="M20 16.7A5 5 0 0018 7h-1.26A8 8 0 104 15.25" />
                </svg>
                Submit cloud render
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                {uploadProgress ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span>Uploading</span>
                      <span>{Math.round((uploadProgress.bytesUploaded / uploadProgress.bytesTotal) * 100)}%</span>
                    </div>
                    <Progress value={Math.round((uploadProgress.bytesUploaded / uploadProgress.bytesTotal) * 100)} />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatBytes(uploadProgress.uploadSpeed)}/s</span>
                      <span>{formatBytes(uploadProgress.bytesUploaded)} / {formatBytes(uploadProgress.bytesTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Preparing upload…</span>
                  </div>
                )}
                <Button variant="outline" onClick={() => uploadProgress && window.racedash.cloudRender.cancelUpload(uploadProgress.jobId)}>
                  Cancel
                </Button>
              </div>
            )}
          </>
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

      {/* RaceDash Cloud footer */}
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-border px-4">
        <span className="text-xs text-muted-foreground">RaceDash Cloud</span>
        {authUser ? (
          <span className="text-xs text-foreground">{authUser.name}</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={onSignIn}>
            Sign in
          </Button>
        )}
      </div>
    </div>
  )
}
