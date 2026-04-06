import { CloudRenderControls } from '@/components/export/CloudRenderControls'
import { LocalRenderControls } from '@/components/export/LocalRenderControls'
import { RenderAssets, type RenderAssetsSelection, buildDefaultSelection } from '@/components/export/RenderAssets'
import { RenderSettings } from '@/components/export/RenderSettings'
import { InfoRow } from '@/components/shared/InfoRow'
import { OfflineState } from '@/components/shared/OfflineState'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/ui/button'
import { OptionGroup } from '@/components/ui/option-group'
import { hasCloudLicense } from '@/lib/license'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOnline } from '../../../hooks/useOnline'
import { toast } from 'sonner'
import type {
  CloudUploadProgressEvent,
  OutputFrameRate,
  OutputResolution,
  RenderCompleteResult,
  RenderMode,
  TimestampsResult,
  VideoInfo,
} from '../../../../../types/ipc'
import type { ProjectData } from '../../../../../types/project'
import type { CutRegion, Transition } from '../../../../../types/videoEditing'
import { computeKeptRanges } from '@/lib/videoEditing'
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
  cutRegions?: CutRegion[]
  transitions?: Transition[]
  timestampsResult?: TimestampsResult | null
}

interface LastRender {
  status: 'completed' | 'error'
  outputPath: string
  timestamp: Date
}

export function ExportTab({
  project,
  videoInfo,
  onRenderingChange,
  overlayType,
  authUser,
  licenseTier,
  onSignIn,
  cutRegions = [],
  transitions = [],
  timestampsResult,
}: ExportTabProps): React.ReactElement {
  const licensed = hasCloudLicense(licenseTier)
  const online = useOnline()
  const fps = videoInfo?.fps ?? 60

  // Render assets selection — default all segments, laps, and adjacent pairs selected
  const [renderAssets, setRenderAssets] = useState<RenderAssetsSelection>(() =>
    buildDefaultSelection(project, timestampsResult, fps),
  )

  // Rebuild selection when timestampsResult loads (laps become available)
  const timestampsLoadedRef = useRef(false)
  useEffect(() => {
    if (!timestampsResult || timestampsLoadedRef.current) return
    timestampsLoadedRef.current = true
    setRenderAssets(buildDefaultSelection(project, timestampsResult, fps))
  }, [timestampsResult, project, fps])

  const hasContent = useMemo(() => {
    if (!videoInfo) return true
    const totalFrames = Math.ceil(videoInfo.durationSeconds * videoInfo.fps)
    return computeKeptRanges(totalFrames, cutRegions).length > 0
  }, [videoInfo, cutRegions])
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
    return () => {
      cleanupRef.current.forEach((fn) => fn())
    }
  }, [])

  // Fetch credit balance when cloud destination is selected
  useEffect(() => {
    if (renderDestination === 'cloud' && authUser) {
      window.racedash.credits
        .getBalance()
        .then((b) => setCreditBalance(b.totalRc))
        .catch(() => { toast.error('Failed to fetch credit balance') })
    }
  }, [renderDestination, authUser])

  // Compute estimated cost when cloud is selected and video info is available
  useEffect(() => {
    if (renderDestination === 'cloud' && videoInfo) {
      window.racedash.cloudRender
        .estimateCost(videoInfo, outputResolution, outputFrameRate)
        .then(setEstimatedCost)
        .catch(() => { toast.error('Failed to estimate render cost') })
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
      }),
    )
    cleanupRef.current.push(
      window.racedash.onRenderComplete((result: RenderCompleteResult) => {
        stopRendering()
        setLastRender({ status: 'completed', outputPath: result.outputPath, timestamp: new Date() })
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      }),
    )
    cleanupRef.current.push(
      window.racedash.onRenderError((err) => {
        stopRendering()
        setLastRender({ status: 'error', outputPath, timestamp: new Date() })
        toast.error('Render failed', { description: err.message })
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      }),
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
        cutRegions,
        transitions,
        selectedSegments: renderAssets.entireProject ? undefined : [...renderAssets.segments],
        selectedLaps: renderAssets.laps.size > 0 ? [...renderAssets.laps] : undefined,
      })
    } catch (err) {
      stopRendering()
      setLastRender({ status: 'error', outputPath, timestamp: new Date() })
      toast.error('Failed to start render', { description: err instanceof Error ? err.message : String(err) })
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
      toast.error('Cloud upload failed', { description: event.message })
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
      const { uploadId: _uploadId, presignedUrls } = await window.racedash.cloudRender.startUpload(jobId, {
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
      toast.error('Cloud render failed', { description: err instanceof Error ? err.message : String(err) })
    }

    cleanupProgress()
    cleanupComplete()
    cleanupError()
  }

  const destinationOptions: Array<{ value: RenderDestination; label: string }> = [
    { value: 'local', label: 'Local' },
    { value: 'cloud', label: 'Cloud' },
  ]

  const isCloudDisabled =
    !authUser || !licenseTier || (estimatedCost !== null && creditBalance !== null && creditBalance < estimatedCost)
  const isBusy = rendering || cloudUploading || !hasContent

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* SOURCE VIDEO */}
      <section>
        <SectionLabel>Source Video</SectionLabel>
        <div className="rounded-md border border-border bg-accent px-3">
          <InfoRow label="Resolution" value={videoInfo ? formatResolution(videoInfo.width, videoInfo.height) : '—'} />
          <div className="border-t border-border" />
          <InfoRow label="Frame rate" value={videoInfo ? formatFps(videoInfo.fps) : '—'} />
        </div>
      </section>

      {/* RENDER DESTINATION */}
      <section>
        <SectionLabel>Render Destination</SectionLabel>
        <OptionGroup
          options={destinationOptions}
          value={renderDestination}
          onValueChange={setRenderDestination as (v: string) => void}
          disabled={isBusy}
        />
      </section>

      {/* RENDER SETTINGS */}
      <RenderSettings
        outputResolution={outputResolution}
        setOutputResolution={setOutputResolution}
        outputFrameRate={outputFrameRate}
        setOutputFrameRate={setOutputFrameRate}
        renderMode={renderMode}
        setRenderMode={setRenderMode}
        licenseTier={licenseTier}
        disabled={isBusy}
      />

      {/* RENDER ASSETS */}
      <RenderAssets
        project={project}
        timestampsResult={timestampsResult}
        fps={fps}
        selection={renderAssets}
        onSelectionChange={setRenderAssets}
        disabled={isBusy}
      />

      {/* DESTINATION-SPECIFIC CONTROLS */}
      {renderDestination === 'local' ? (
        <LocalRenderControls
          outputPath={outputPath}
          setOutputPath={setOutputPath}
          onBrowse={handleBrowse}
          onRender={handleRender}
          isBusy={isBusy}
          rendering={rendering}
          renderPhase={renderPhase}
          renderProgress={renderProgress}
          renderFrames={renderFrames}
          etaSeconds={etaSeconds}
        />
      ) : online ? (
        <CloudRenderControls
          authUser={authUser}
          licenseTier={licenseTier}
          onSignIn={onSignIn}
          estimatedCost={estimatedCost}
          creditBalance={creditBalance}
          isCloudDisabled={isCloudDisabled}
          onCloudRender={handleCloudRender}
          cloudUploading={cloudUploading}
          uploadProgress={uploadProgress}
          videoInfo={videoInfo}
        />
      ) : (
        <OfflineState feature="Cloud Render" />
      )}

      {/* LAST RENDER */}
      {lastRender && (
        <section>
          <SectionLabel>Last Render</SectionLabel>
          <div className="flex items-center gap-3 rounded-md border border-border bg-accent px-3 py-2">
            <div
              className={[
                'h-2 w-2 shrink-0 rounded-full',
                lastRender.status === 'completed' ? 'bg-green-500' : 'bg-destructive',
              ].join(' ')}
            />
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
