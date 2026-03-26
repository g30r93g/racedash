import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import React from 'react'
import { Play, Loader2 } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.ceil(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// ── component ─────────────────────────────────────────────────────────────────

interface LocalRenderControlsProps {
  outputPath: string
  setOutputPath: (v: string) => void
  onBrowse: () => void
  onRender: () => void
  isBusy: boolean
  rendering: boolean
  renderPhase: string
  renderProgress: number
  renderFrames: { rendered: number; total: number } | null
  etaSeconds: number | null
}

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #6e6e6e 0%, #6e6e6e 25%, #e8e8e8 45%, #ffffff 50%, #e8e8e8 55%, #6e6e6e 75%, #6e6e6e 100%)',
  backgroundSize: '400% 100%',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
  animation: 'shimmer 3.5s linear infinite',
}

export function LocalRenderControls({
  outputPath,
  setOutputPath,
  onBrowse,
  onRender,
  isBusy,
  rendering,
  renderPhase,
  renderProgress,
  renderFrames,
  etaSeconds,
}: LocalRenderControlsProps): React.ReactElement {
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
          <Button variant="outline" size="sm" onClick={onBrowse} disabled={isBusy}>Browse</Button>
        </div>
      </section>

      {/* RENDER BUTTON / PROGRESS */}
      <section>
        {!rendering ? (
          <Button onClick={onRender} className="w-full gap-2">
            <Play size={14} aria-hidden="true" />
            Render
          </Button>
        ) : renderProgress === 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="animate-spin h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
      </section>
    </>
  )
}
