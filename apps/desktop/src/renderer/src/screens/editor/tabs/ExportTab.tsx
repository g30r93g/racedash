import { CloudRenderControls } from '@/components/export/CloudRenderControls'
import { LocalRenderControls } from '@/components/export/LocalRenderControls'
import { RenderAssets, type RenderAssetsSelection, type SegmentInfo, buildDefaultSelection, buildSegmentInfos } from '@/components/export/RenderAssets'
import { RenderSettings } from '@/components/export/RenderSettings'
import { InfoRow } from '@/components/shared/InfoRow'
import { OfflineState } from '@/components/shared/OfflineState'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/ui/button'
import { OptionGroup } from '@/components/ui/option-group'
import { hasCloudLicense } from '@/lib/license'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOnline } from '../../../hooks/useOnline'
import { toast } from 'sonner'
import type {
  CloudUploadProgressEvent,
  OutputFrameRate,
  OutputResolution,
  RenderBatchJob,
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

/** Renderer-safe slugify (mirrors apps/desktop/src/main/utils/slugify.ts). */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Build an output filename in the renderer without node:path. */
function buildOutputPath(
  dir: string,
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap',
  options: { labels?: string[]; lapNumber?: number; timestamp?: string; overlayOnly?: boolean } = {},
): string {
  const ts = options.timestamp ?? new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  const ext = options.overlayOnly ? '.mov' : '.mp4'
  const overlaySuffix = options.overlayOnly ? '-overlay' : ''

  if (type === 'entireProject') {
    return `${dir}/output${overlaySuffix}-${ts}${ext}`
  }

  const slug = (options.labels ?? []).map(slugify).join('-') || 'unknown'

  if (type === 'lap') {
    return `${dir}/output-${slug}-lap${options.lapNumber}${overlaySuffix}-${ts}${ext}`
  }

  return `${dir}/output-${slug}${overlaySuffix}-${ts}${ext}`
}

type RenderDestination = 'local' | 'cloud'

// ── render job types ──────────────────────────────────────────────────────────

interface RenderJob {
  id: string
  label: string
  status: 'queued' | 'rendering' | 'completed' | 'error' | 'skipped'
  progress: number
  phase: string
  error?: string
}

// ── job list builder ──────────────────────────────────────────────────────────

function buildJobList(
  selection: RenderAssetsSelection,
  segments: SegmentInfo[],
  outputDir: string,
  overlayOnly: boolean,
): { jobs: RenderJob[]; batchJobs: RenderBatchJob[] } {
  const jobs: RenderJob[] = []
  const batchJobs: RenderBatchJob[] = []
  const ts = new Date().toTimeString().slice(0, 8).replace(/:/g, '')

  // Track which segment indices are already covered by a linked pair
  const coveredByLinkedPair = new Set<number>()
  for (const pairStr of selection.linkedPairs) {
    const [minStr, maxStr] = pairStr.split(':')
    const min = Number(minStr)
    const max = Number(maxStr)
    // Only mark as covered if both segments in the pair are selected
    if (selection.segments.has(min) && selection.segments.has(max)) {
      coveredByLinkedPair.add(min)
      coveredByLinkedPair.add(max)
    }
  }

  // 1. Entire project
  if (selection.entireProject) {
    const id = crypto.randomUUID()
    const outPath = buildOutputPath(outputDir, 'entireProject', { timestamp: ts, overlayOnly })
    jobs.push({ id, label: 'Entire Project', status: 'queued', progress: 0, phase: '' })
    batchJobs.push({
      id,
      type: 'entireProject',
      segmentIndices: segments.map((s) => s.index),
      outputPath: outPath,
    })
  }

  // 2. Linked segment pairs (deduplicated)
  const processedPairs = new Set<string>()
  for (const pairStr of selection.linkedPairs) {
    if (processedPairs.has(pairStr)) continue
    processedPairs.add(pairStr)

    const [minStr, maxStr] = pairStr.split(':')
    const min = Number(minStr)
    const max = Number(maxStr)

    if (!selection.segments.has(min) && !selection.segments.has(max)) continue

    const minSeg = segments.find((s) => s.index === min)
    const maxSeg = segments.find((s) => s.index === max)
    if (!minSeg || !maxSeg) continue

    const id = crypto.randomUUID()
    const labels = [minSeg.label, maxSeg.label]
    const outPath = buildOutputPath(outputDir, 'linkedSegment', { labels, timestamp: ts, overlayOnly })
    jobs.push({ id, label: `${minSeg.label} + ${maxSeg.label}`, status: 'queued', progress: 0, phase: '' })
    batchJobs.push({
      id,
      type: 'linkedSegment',
      segmentIndices: [min, max],
      outputPath: outPath,
    })
  }

  // 3. Standalone segments (not covered by a linked pair)
  for (const segIdx of selection.segments) {
    if (coveredByLinkedPair.has(segIdx)) continue
    const seg = segments.find((s) => s.index === segIdx)
    if (!seg) continue

    const id = crypto.randomUUID()
    const outPath = buildOutputPath(outputDir, 'segment', { labels: [seg.label], timestamp: ts, overlayOnly })
    jobs.push({ id, label: seg.label, status: 'queued', progress: 0, phase: '' })
    batchJobs.push({
      id,
      type: 'segment',
      segmentIndices: [segIdx],
      outputPath: outPath,
    })
  }

  // 4. Laps
  for (const lapKey of selection.laps) {
    const [segIdxStr, lapNumStr] = lapKey.split(':')
    const segIdx = Number(segIdxStr)
    const lapNum = Number(lapNumStr)
    const seg = segments.find((s) => s.index === segIdx)
    if (!seg) continue

    const id = crypto.randomUUID()
    const outPath = buildOutputPath(outputDir, 'lap', {
      labels: [seg.label],
      lapNumber: lapNum,
      timestamp: ts,
      overlayOnly,
    })
    jobs.push({ id, label: `${seg.label} — Lap ${lapNum}`, status: 'queued', progress: 0, phase: '' })
    batchJobs.push({
      id,
      type: 'lap',
      segmentIndices: [segIdx],
      lapNumber: lapNum,
      outputPath: outPath,
    })
  }

  return { jobs, batchJobs }
}

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

  const segments = useMemo(
    () => buildSegmentInfos(project, timestampsResult, fps),
    [project, timestampsResult, fps],
  )

  const defaultOutputPath = `${dirname(project.projectPath)}/output.mp4`
  const [outputPath, setOutputPath] = useState(defaultOutputPath)
  const outputDir = dirname(outputPath)
  const [outputResolution, setOutputResolution] = useState<OutputResolution>('source')
  const [outputFrameRate, setOutputFrameRate] = useState<OutputFrameRate>('source')
  const [renderMode, setRenderMode] = useState<RenderMode>('overlay+footage')
  const [rendering, setRendering] = useState(false)
  const [jobs, setJobs] = useState<RenderJob[]>([])
  const [lastRender, setLastRender] = useState<LastRender | null>(null)

  // Cloud render state
  const [renderDestination, setRenderDestination] = useState<RenderDestination>(licensed ? 'cloud' : 'local')
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [cloudUploading, setCloudUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<CloudUploadProgressEvent | null>(null)

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

  // ── batch render handler ────────────────────────────────────────────────────

  async function handleRender() {
    const overlayOnly = renderMode === 'overlay-only'
    const { jobs: newJobs, batchJobs } = buildJobList(renderAssets, segments, outputDir, overlayOnly)

    if (batchJobs.length === 0) {
      toast.error('No render assets selected')
      return
    }

    setJobs(newJobs)
    startRendering()

    // Clean up any previous listeners
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []

    // Listen to batch events
    cleanupRef.current.push(
      window.racedash.onBatchJobProgress((event) => {
        if (event.jobId === '__precompute__') {
          // Show precompute progress on the first job
          setJobs((prev) => {
            const first = prev[0]
            if (!first || first.status === 'completed') return prev
            return prev.map((j, i) =>
              i === 0 ? { ...j, status: 'rendering' as const, progress: 0, phase: event.phase } : j,
            )
          })
          return
        }
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId
              ? { ...j, status: 'rendering', progress: event.progress, phase: event.phase }
              : j,
          ),
        )
      }),
    )

    cleanupRef.current.push(
      window.racedash.onBatchJobComplete((event) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId
              ? { ...j, status: 'completed', progress: 1, phase: '' }
              : j,
          ),
        )
      }),
    )

    cleanupRef.current.push(
      window.racedash.onBatchJobError((event) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId
              ? { ...j, status: 'error', phase: '', error: event.message }
              : j,
          ),
        )
      }),
    )

    cleanupRef.current.push(
      window.racedash.onBatchComplete(() => {
        stopRendering()
        setJobs((prev) => {
          const hasError = prev.some((j) => j.status === 'error')
          const lastCompleted = prev.find((j) => j.status === 'completed')
          setLastRender({
            status: hasError ? 'error' : 'completed',
            outputPath: lastCompleted?.id ? batchJobs.find((bj) => bj.id === lastCompleted.id)?.outputPath ?? outputDir : outputDir,
            timestamp: new Date(),
          })
          return prev
        })
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      }),
    )

    try {
      await window.racedash.startBatchRender({
        configPath: project.configPath,
        videoPaths: project.videoPaths,
        outputDir,
        style: overlayType,
        outputResolution,
        renderMode,
        jobs: batchJobs,
        cutRegions,
        transitions,
      })
    } catch (err) {
      stopRendering()
      toast.error('Failed to start render', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── retry / cancel handlers ─────────────────────────────────────────────────

  const handleRetry = useCallback((jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'queued', progress: 0, phase: '', error: undefined } : j)),
    )
    startRendering()

    // Re-attach listeners (they may have been cleaned up after batch complete)
    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []

    cleanupRef.current.push(
      window.racedash.onBatchJobProgress((event) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId
              ? { ...j, status: 'rendering', progress: event.progress, phase: event.phase }
              : j,
          ),
        )
      }),
    )
    cleanupRef.current.push(
      window.racedash.onBatchJobComplete((event) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId ? { ...j, status: 'completed', progress: 1, phase: '' } : j,
          ),
        )
      }),
    )
    cleanupRef.current.push(
      window.racedash.onBatchJobError((event) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId ? { ...j, status: 'error', phase: '', error: event.message } : j,
          ),
        )
      }),
    )
    cleanupRef.current.push(
      window.racedash.onBatchComplete(() => {
        stopRendering()
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      }),
    )

    window.racedash.retryBatchJobs([jobId]).catch((err) => {
      stopRendering()
      toast.error('Retry failed', { description: err instanceof Error ? err.message : String(err) })
    })
  }, [])

  const handleRetryAll = useCallback(() => {
    const failedIds = jobs.filter((j) => j.status === 'error' || j.status === 'skipped').map((j) => j.id)
    if (failedIds.length === 0) return

    setJobs((prev) =>
      prev.map((j) =>
        j.status === 'error' || j.status === 'skipped'
          ? { ...j, status: 'queued', progress: 0, phase: '', error: undefined }
          : j,
      ),
    )
    startRendering()

    cleanupRef.current.forEach((fn) => fn())
    cleanupRef.current = []

    cleanupRef.current.push(
      window.racedash.onBatchJobProgress((event) => {
        if (event.jobId === '__precompute__') {
          setJobs((prev) => {
            const firstQueued = prev.find((j) => j.status === 'queued')
            if (!firstQueued) return prev
            return prev.map((j) =>
              j.id === firstQueued.id ? { ...j, status: 'rendering' as const, progress: 0, phase: event.phase } : j,
            )
          })
          return
        }
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId
              ? { ...j, status: 'rendering', progress: event.progress, phase: event.phase }
              : j,
          ),
        )
      }),
    )
    cleanupRef.current.push(
      window.racedash.onBatchJobComplete((event) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId ? { ...j, status: 'completed', progress: 1, phase: '' } : j,
          ),
        )
      }),
    )
    cleanupRef.current.push(
      window.racedash.onBatchJobError((event) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === event.jobId ? { ...j, status: 'error', phase: '', error: event.message } : j,
          ),
        )
      }),
    )
    cleanupRef.current.push(
      window.racedash.onBatchComplete(() => {
        stopRendering()
        cleanupRef.current.forEach((fn) => fn())
        cleanupRef.current = []
      }),
    )

    window.racedash.retryBatchJobs(failedIds).catch((err) => {
      stopRendering()
      toast.error('Retry failed', { description: err instanceof Error ? err.message : String(err) })
    })
  }, [jobs])

  const handleCancel = useCallback(() => {
    window.racedash.cancelBatchRender().catch((err) => {
      toast.error('Cancel failed', { description: err instanceof Error ? err.message : String(err) })
    })
  }, [])

  // ── cloud render handler (unchanged) ────────────────────────────────────────

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
          jobs={jobs}
          onRetry={handleRetry}
          onRetryAll={handleRetryAll}
          onCancel={handleCancel}
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
