import { RenderJobQueue } from '@/components/export/RenderJobQueue'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import React from 'react'
import { Play } from 'lucide-react'

// ── types ────────────────────────────────────────────────────────────────────

interface RenderJob {
  id: string
  label: string
  status: 'queued' | 'rendering' | 'completed' | 'error' | 'skipped'
  progress: number
  phase: string
  error?: string
}

// ── component ────────────────────────────────────────────────────────────────

interface LocalRenderControlsProps {
  outputPath: string
  setOutputPath: (v: string) => void
  onBrowse: () => void
  onRender: () => void
  isBusy: boolean
  rendering: boolean
  jobs: RenderJob[]
  onRetry: (jobId: string) => void
  onRetryAll: () => void
  onCancel: () => void
}

export function LocalRenderControls({
  outputPath,
  setOutputPath,
  onBrowse,
  onRender,
  isBusy,
  rendering,
  jobs,
  onRetry,
  onRetryAll,
  onCancel,
}: LocalRenderControlsProps): React.ReactElement {
  const hasJobs = jobs.length > 0

  return (
    <>
      {/* OUTPUT PATH */}
      <section>
        <SectionLabel>Output Path</SectionLabel>
        <div className="flex items-center gap-2">
          <Input
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            className="min-w-0 flex-1 font-mono text-xs"
            disabled={isBusy}
          />
          <Button variant="outline" size="sm" onClick={onBrowse} disabled={isBusy}>
            Browse
          </Button>
        </div>
      </section>

      {/* RENDER BUTTON / JOB QUEUE */}
      <section>
        {!hasJobs ? (
          <Button onClick={onRender} className="w-full gap-2" disabled={isBusy}>
            <Play size={14} aria-hidden="true" />
            Render
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <RenderJobQueue
              jobs={jobs}
              onRetry={onRetry}
              onRetryAll={onRetryAll}
              onCancel={onCancel}
              batchActive={rendering}
            />
            {!rendering && (
              <Button onClick={onRender} className="w-full gap-2" disabled={isBusy}>
                <Play size={14} aria-hidden="true" />
                Render
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  )
}
