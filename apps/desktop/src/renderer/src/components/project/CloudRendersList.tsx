import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@clerk/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '../shared/SectionLabel'
import { YouTubeUploadDialog } from './YouTubeUploadDialog'
import type { CloudRenderJob, CloudJobStatus, SocialUploadStatus, YouTubeUploadMetadata } from '../../../../types/ipc'

function formatCountdown(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `Expires in ${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`
  return `Expires in ${hours} hour${hours !== 1 ? 's' : ''}`
}

function statusBadge(status: CloudJobStatus): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  switch (status) {
    case 'uploading': return { label: 'Uploading', variant: 'secondary' }
    case 'queued': return { label: 'Queued', variant: 'outline' }
    case 'rendering': return { label: 'Rendering', variant: 'secondary' }
    case 'compositing': return { label: 'Compositing', variant: 'secondary' }
    case 'complete': return { label: 'Complete', variant: 'default' }
    case 'failed': return { label: 'Failed', variant: 'destructive' }
  }
}

const ACTIVE_STATUSES: CloudJobStatus[] = ['uploading', 'queued', 'rendering', 'compositing']

interface CloudRendersListProps {
  authUser?: { name: string } | null
  youtubeConnected: boolean
  creditBalance: number
}

export function CloudRendersList({ authUser, youtubeConnected, creditBalance }: CloudRendersListProps): React.ReactElement {
  const { session } = useSession()
  const [jobs, setJobs] = useState<CloudRenderJob[]>([])
  const [loading, setLoading] = useState(true)
  const sseRefs = useRef<Map<string, EventSource>>(new Map())

  // Fetch jobs on mount and when authUser changes
  const fetchJobs = useCallback(async () => {
    if (!authUser) {
      setJobs([])
      setLoading(false)
      return
    }
    try {
      const result = await window.racedash.cloudRender.listJobs()
      setJobs(result.jobs)
    } catch {
      // Silently handle — user may not be authenticated
    } finally {
      setLoading(false)
    }
  }, [authUser])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Set up SSE connections for active jobs
  useEffect(() => {
    const currentSources = sseRefs.current

    const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status))

    // Close SSE for jobs that are no longer active
    for (const [id, source] of currentSources) {
      if (!activeJobs.find((j) => j.id === id)) {
        source.close()
        currentSources.delete(id)
      }
    }

    // Open SSE for new active jobs
    for (const job of activeJobs) {
      if (currentSources.has(job.id)) continue

      window.racedash.cloudRender.getStatusUrl(job.id).then((url) => {
        // Get auth token for SSE — use fetchWithAuth to construct the URL
        session?.getToken().then((token) => {
          if (!token) return
          const sseUrl = `${url}?token=${encodeURIComponent(token)}`
          const source = new EventSource(sseUrl)

          source.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              setJobs((prev) => prev.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      status: data.status,
                      progress: data.progress ?? j.progress,
                      queuePosition: data.queuePosition,
                      downloadExpiresAt: data.downloadExpiresAt,
                      errorMessage: data.errorMessage,
                    }
                  : j
              ))

              // Close SSE on terminal state
              if (data.status === 'complete' || data.status === 'failed') {
                source.close()
                currentSources.delete(job.id)
              }
            } catch {
              // Ignore parse errors
            }
          }

          source.onerror = () => {
            source.close()
            currentSources.delete(job.id)
          }

          currentSources.set(job.id, source)
        })
      })
    }

    return () => {
      for (const [, source] of currentSources) {
        source.close()
      }
      currentSources.clear()
    }
  }, [jobs.map((j) => `${j.id}:${j.status}`).join(',')])

  // Refresh job list periodically to pick up new jobs
  useEffect(() => {
    if (!authUser) return
    const interval = setInterval(fetchJobs, 30_000)
    return () => clearInterval(interval)
  }, [authUser, fetchJobs])

  const [uploadDialogJob, setUploadDialogJob] = useState<CloudRenderJob | null>(null)

  const handleUpload = useCallback(async (metadata: YouTubeUploadMetadata) => {
    if (!uploadDialogJob) return
    await window.racedash.youtube.upload(uploadDialogJob.id, metadata)
    setUploadDialogJob(null)
  }, [uploadDialogJob])

  if (loading) {
    return <p className="p-4 text-xs text-muted-foreground">Loading…</p>
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm text-muted-foreground">No cloud renders yet.</p>
        <p className="text-xs text-muted-foreground">
          Submit a render from the Export tab to get started.
        </p>
      </div>
    )
  }

  const active = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status))
  const completed = jobs.filter((j) => j.status === 'complete')
  const failed = jobs.filter((j) => j.status === 'failed')

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {active.length > 0 && (
            <section>
              <SectionLabel>Active</SectionLabel>
              <div className="flex flex-col gap-2">
                {active.map((job) => <JobCard key={job.id} job={job} youtubeConnected={youtubeConnected} onUploadClick={setUploadDialogJob} />)}
              </div>
            </section>
          )}
          {active.length > 0 && (completed.length > 0 || failed.length > 0) && <Separator />}
          {completed.length > 0 && (
            <section>
              <SectionLabel>Completed</SectionLabel>
              <div className="flex flex-col gap-2">
                {completed.map((job) => <JobCard key={job.id} job={job} youtubeConnected={youtubeConnected} onUploadClick={setUploadDialogJob} />)}
              </div>
            </section>
          )}
          {completed.length > 0 && failed.length > 0 && <Separator />}
          {failed.length > 0 && (
            <section>
              <SectionLabel>Failed</SectionLabel>
              <div className="flex flex-col gap-2">
                {failed.map((job) => <JobCard key={job.id} job={job} youtubeConnected={youtubeConnected} onUploadClick={setUploadDialogJob} />)}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      {uploadDialogJob && (
        <YouTubeUploadDialog
          open={!!uploadDialogJob}
          onOpenChange={(open) => { if (!open) setUploadDialogJob(null) }}
          onUpload={handleUpload}
          defaultTitle={`${uploadDialogJob.projectName} - ${uploadDialogJob.sessionType}`}
          creditBalance={creditBalance}
        />
      )}
    </>
  )
}

function JobCard({ job, youtubeConnected, onUploadClick }: {
  job: CloudRenderJob
  youtubeConnected: boolean
  onUploadClick: (job: CloudRenderJob) => void
}): React.ReactElement {
  const badge = statusBadge(job.status)
  const isExpired = job.downloadExpiresAt ? new Date(job.downloadExpiresAt) < new Date() : false
  const [uploads, setUploads] = useState<SocialUploadStatus[]>([])

  useEffect(() => {
    if (job.status === 'complete') {
      window.racedash.youtube.getUploads(job.id).then(setUploads).catch(() => {})
    }
  }, [job.id, job.status])

  const youtubeUpload = uploads.find((u) => u.platform === 'youtube')
  const hasActiveUpload = youtubeUpload && ['queued', 'uploading', 'processing', 'live'].includes(youtubeUpload.status)

  async function handleDownload() {
    try {
      const dir = await window.racedash.openDirectory({ title: 'Choose download folder' })
      if (!dir) return
      const outputPath = `${dir}/${job.projectName.replace(/[^a-zA-Z0-9-_. ]/g, '')}.mp4`
      await window.racedash.cloudRender.downloadRender(job.id, outputPath)
      window.racedash.revealInFinder(outputPath)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-accent/40 p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-foreground">{job.projectName}</span>
        <Badge variant={badge.variant} className="text-[10px] shrink-0">{badge.label}</Badge>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {new Date(job.createdAt).toLocaleDateString()} · {job.config.resolution} · {job.config.renderMode}
      </p>

      {/* Queued — show queue position */}
      {job.status === 'queued' && job.queuePosition != null && (
        <p className="text-[11px] text-muted-foreground">
          Position {job.queuePosition} in queue
        </p>
      )}

      {/* Rendering — show progress bar */}
      {job.status === 'rendering' && (
        <div className="mt-1">
          <Progress value={Math.round(job.progress * 100)} />
          <p className="mt-0.5 text-[10px] text-muted-foreground">{Math.round(job.progress * 100)}%</p>
        </div>
      )}

      {/* Compositing — indeterminate progress */}
      {job.status === 'compositing' && (
        <div className="mt-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" style={{ animation: 'slide 1.5s ease-in-out infinite' }} />
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Compositing video…</p>
        </div>
      )}

      {/* Uploading — progress bar */}
      {job.status === 'uploading' && (
        <div className="mt-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Uploading…</p>
        </div>
      )}

      {/* Complete — download button, expiry, and YouTube upload */}
      {job.status === 'complete' && (
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleDownload}
              disabled={isExpired}
            >
              {isExpired ? 'Expired' : 'Download'}
            </Button>
            {youtubeUpload?.status === 'live' && (
              <Button variant="outline" size="sm" className="text-xs"
                onClick={() => window.open(youtubeUpload.platformUrl ?? undefined)}>
                View on YouTube
              </Button>
            )}
            {!hasActiveUpload && youtubeConnected && (
              <Button variant="outline" size="sm" className="text-xs"
                onClick={() => onUploadClick(job)}>
                Upload to YouTube
              </Button>
            )}
            {job.downloadExpiresAt && (
              <span className="text-[10px] text-muted-foreground">
                {formatCountdown(job.downloadExpiresAt)}
              </span>
            )}
          </div>

          {youtubeUpload?.status === 'failed' && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-destructive">{youtubeUpload.errorMessage}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs"
                  onClick={() => onUploadClick(job)}>
                  Retry Upload
                </Button>
                <span className="text-[10px] text-muted-foreground">10 RC refunded</span>
              </div>
            </div>
          )}

          {youtubeUpload && ['queued', 'uploading', 'processing'].includes(youtubeUpload.status) && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              <span className="text-[10px] text-muted-foreground">
                {youtubeUpload.status === 'queued' ? 'Queued...' :
                 youtubeUpload.status === 'uploading' ? 'Uploading to YouTube...' :
                 'Processing on YouTube...'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Failed — error message and credits restored note */}
      {job.status === 'failed' && (
        <div className="mt-1 flex flex-col gap-0.5">
          {job.errorMessage && (
            <p className="text-[11px] text-destructive">{job.errorMessage}</p>
          )}
          <p className="text-[10px] text-muted-foreground">Credits restored</p>
        </div>
      )}
    </div>
  )
}
