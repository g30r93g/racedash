import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'

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
  youtubeUrl?: string
  timeRemaining?: string
  storageUsedGb: number
  storageLimitGb: number
}

export function CloudRendersList(): React.ReactElement {
  // Stub: Cloud Renders IPC deferred
  const jobs: CloudRenderJob[] = []
  const loading = false

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
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 p-4">
        {queued.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Queued
            </p>
            {queued.map((job) => <JobRow key={job.id} job={job} />)}
          </section>
        )}
        {queued.length > 0 && inProgress.length > 0 && <Separator />}
        {inProgress.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              In Progress
            </p>
            {inProgress.map((job) => <JobRow key={job.id} job={job} />)}
          </section>
        )}
        {(queued.length > 0 || inProgress.length > 0) && completed.length > 0 && <Separator />}
        {completed.length > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Completed
            </p>
            {completed.map((job) => <JobRow key={job.id} job={job} />)}
          </section>
        )}
        {jobs[0] && (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Storage</span>
                <span className="text-foreground">
                  {jobs[0].storageUsedGb}GB / {jobs[0].storageLimitGb}GB
                </span>
              </div>
              <Progress value={(jobs[0].storageUsedGb / jobs[0].storageLimitGb) * 100} />
              <button className="text-left text-xs text-primary hover:underline">
                Manage storage
              </button>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}

function JobRow({ job }: { job: CloudRenderJob }): React.ReactElement {
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
        <div className="mt-1 flex gap-2">
          {job.outputUrl && (
            <Button variant="outline" size="sm" className="text-xs">Download</Button>
          )}
          {job.youtubeUrl && (
            <Button variant="outline" size="sm" className="text-xs">YouTube</Button>
          )}
        </div>
      )}
    </div>
  )
}
