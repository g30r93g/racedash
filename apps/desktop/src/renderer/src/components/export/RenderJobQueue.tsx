import { Progress } from '@/components/ui/progress'
import React from 'react'

// ── types ─────────────────────────────────────────────────────────────────────

type RenderJobStatus = 'queued' | 'rendering' | 'completed' | 'error' | 'skipped'

interface RenderJob {
  id: string
  label: string
  status: RenderJobStatus
  progress: number
  phase: string
  error?: string
}

interface RenderJobQueueProps {
  jobs: RenderJob[]
  onRetry: (jobId: string) => void
  onRetryAll: () => void
  onCancel: () => void
  batchActive: boolean
}

// ── helpers ───────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: RenderJobStatus }): React.ReactElement {
  switch (status) {
    case 'completed':
      return <span className="text-green-500 text-xs font-medium w-3 text-center">✓</span>
    case 'rendering':
      return <span className="text-primary text-xs font-medium w-3 text-center">●</span>
    case 'queued':
      return <span className="text-muted-foreground/50 text-xs font-medium w-3 text-center">○</span>
    case 'error':
      return <span className="text-destructive text-xs font-medium w-3 text-center">✕</span>
    case 'skipped':
      return <span className="text-muted-foreground text-xs font-medium w-3 text-center">−</span>
  }
}

function statusLabel(status: RenderJobStatus): string {
  switch (status) {
    case 'completed': return 'completed'
    case 'rendering': return 'rendering'
    case 'queued': return 'queued'
    case 'error': return 'error'
    case 'skipped': return 'skipped'
  }
}

function statusColor(status: RenderJobStatus): string {
  switch (status) {
    case 'completed': return 'text-green-500'
    case 'rendering': return 'text-primary'
    case 'queued': return 'text-muted-foreground/50'
    case 'error': return 'text-destructive'
    case 'skipped': return 'text-muted-foreground'
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export function RenderJobQueue({
  jobs,
  onRetry,
  onRetryAll,
  onCancel,
  batchActive,
}: RenderJobQueueProps): React.ReactElement {
  const hasErrors = jobs.some((j) => j.status === 'error' || j.status === 'skipped')
  const showRetryAll = !batchActive && hasErrors

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-border bg-accent overflow-hidden">
        {jobs.map((job, i) => (
          <React.Fragment key={job.id}>
            {i > 0 && <div className="border-t border-border" />}
            <div className="flex items-center gap-2.5 px-3 py-2">
              {/* Status icon */}
              <StatusIcon status={job.status} />

              {/* Label */}
              <span className="flex-1 min-w-0 truncate text-xs text-foreground">{job.label}</span>

              {/* Status / progress info */}
              {job.status === 'rendering' ? (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20">
                    <Progress value={Math.round(job.progress * 100)} className="h-1" />
                  </div>
                  <span className="tabular-nums text-[10px] text-muted-foreground w-7 text-right">
                    {Math.round(job.progress * 100)}%
                  </span>
                  {job.phase && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-16">{job.phase}</span>
                  )}
                </div>
              ) : (
                <span
                  className={`text-[10px] shrink-0 ${statusColor(job.status)}`}
                  title={job.error}
                >
                  {statusLabel(job.status)}
                </span>
              )}

              {/* Retry button for error / skipped */}
              {(job.status === 'error' || job.status === 'skipped') && (
                <button
                  className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 transition-colors"
                  onClick={() => onRetry(job.id)}
                  title={job.error ? `Error: ${job.error}` : undefined}
                >
                  Retry
                </button>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Bottom action bar */}
      {(batchActive || showRetryAll) && (
        <div className="flex items-center justify-between gap-2">
          {batchActive ? (
            <button
              className="flex-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 transition-colors"
              onClick={onCancel}
            >
              Cancel
            </button>
          ) : (
            <div className="flex-1" />
          )}
          {showRetryAll && (
            <button
              className="flex-1 text-xs text-foreground hover:text-foreground/80 border border-border rounded-md px-3 py-1.5 transition-colors bg-accent"
              onClick={onRetryAll}
            >
              Retry All
            </button>
          )}
        </div>
      )}
    </div>
  )
}
