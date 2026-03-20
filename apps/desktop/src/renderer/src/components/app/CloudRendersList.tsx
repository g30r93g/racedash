import React, { useState, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { SectionLabel } from './SectionLabel'
import { YouTubeUploadDialog } from './YouTubeUploadDialog'
import type { SocialUploadStatus, YouTubeUploadMetadata } from '../../../../types/ipc'

interface CloudRenderJob {
  id: string
  projectName: string
  sessionType: 'Race' | 'Qualifying' | 'Practice'
  status: 'queued' | 'in-progress' | 'completed'
  startedAt?: string
  resolution: string
  renderMode: string
  progress?: number
  outputUrl?: string
  downloadExpiresAt?: string
  timeRemaining?: string
  uploads?: SocialUploadStatus[]
}

interface CloudRendersListProps {
  youtubeConnected: boolean
  creditBalance: number
}

export function CloudRendersList({ youtubeConnected, creditBalance }: CloudRendersListProps): React.ReactElement {
  // Stub: Cloud Renders IPC deferred
  const jobs: CloudRenderJob[] = []
  const loading = false

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

  const queued = jobs.filter((j) => j.status === 'queued')
  const inProgress = jobs.filter((j) => j.status === 'in-progress')
  const completed = jobs.filter((j) => j.status === 'completed')

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {queued.length > 0 && (
            <section>
              <SectionLabel>Queued</SectionLabel>
              {queued.map((job) => <JobRow key={job.id} job={job} youtubeConnected={youtubeConnected} onUploadClick={setUploadDialogJob} />)}
            </section>
          )}
          {queued.length > 0 && inProgress.length > 0 && <Separator />}
          {inProgress.length > 0 && (
            <section>
              <SectionLabel>In Progress</SectionLabel>
              {inProgress.map((job) => <JobRow key={job.id} job={job} youtubeConnected={youtubeConnected} onUploadClick={setUploadDialogJob} />)}
            </section>
          )}
          {(queued.length > 0 || inProgress.length > 0) && completed.length > 0 && <Separator />}
          {completed.length > 0 && (
            <section>
              <SectionLabel>Completed</SectionLabel>
              {completed.map((job) => <JobRow key={job.id} job={job} youtubeConnected={youtubeConnected} onUploadClick={setUploadDialogJob} />)}
            </section>
          )}
          {/* Storage usage bar removed — cloud storage sync deferred to phase 2 */}
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

function JobRow({ job, youtubeConnected, onUploadClick }: {
  job: CloudRenderJob
  youtubeConnected: boolean
  onUploadClick: (job: CloudRenderJob) => void
}): React.ReactElement {
  const youtubeUpload = job.uploads?.find((u) => u.platform === 'youtube')
  const hasActiveUpload = youtubeUpload && ['queued', 'uploading', 'processing', 'live'].includes(youtubeUpload.status)

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-accent/40 p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-foreground">{job.projectName}</span>
        <Badge variant="outline" className="text-[10px]">{job.sessionType}</Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {job.startedAt ? new Date(job.startedAt).toLocaleDateString() : '—'} · {job.resolution} · {job.renderMode}
      </p>
      {job.status === 'in-progress' && job.progress !== undefined && (
        <Progress value={job.progress * 100} className="mt-1" />
      )}
      {job.status === 'in-progress' && job.timeRemaining && (
        <p className="text-[11px] text-muted-foreground">{job.timeRemaining}</p>
      )}
      {job.status === 'completed' && (
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex gap-2">
            {job.downloadExpiresAt && new Date(job.downloadExpiresAt) > new Date() && (
              <Button variant="outline" size="sm" className="text-xs">Download</Button>
            )}
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
    </div>
  )
}
