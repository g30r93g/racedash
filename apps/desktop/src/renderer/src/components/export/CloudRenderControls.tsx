import { SectionLabel } from '@/components/shared/SectionLabel'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import React from 'react'
import { CloudUpload, Loader2 } from 'lucide-react'
import type { CloudUploadProgressEvent, VideoInfo } from '../../../../../types/ipc'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ── component ─────────────────────────────────────────────────────────────────

interface CloudRenderControlsProps {
  authUser?: { name: string } | null
  licenseTier?: 'plus' | 'pro' | null
  onSignIn?: () => void
  estimatedCost: number | null
  creditBalance: number | null
  isCloudDisabled: boolean
  onCloudRender: () => void
  cloudUploading: boolean
  uploadProgress: CloudUploadProgressEvent | null
  videoInfo?: VideoInfo | null
}

export function CloudRenderControls({
  authUser,
  licenseTier,
  onSignIn,
  estimatedCost,
  creditBalance,
  isCloudDisabled,
  onCloudRender,
  cloudUploading,
  uploadProgress,
  videoInfo,
}: CloudRenderControlsProps): React.ReactElement {
  return (
    <>
      {/* CLOUD RENDER INFO */}
      <section>
        <SectionLabel>Cloud Render</SectionLabel>
        {!authUser ? (
          <div className="rounded-md border border-border bg-accent px-3 py-3">
            <p className="text-xs text-muted-foreground">Sign in to use cloud rendering</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onSignIn}>
              Sign in
            </Button>
          </div>
        ) : !licenseTier ? (
          <div className="rounded-md border border-border bg-accent px-3 py-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Subscription required:</span> Cloud rendering requires a
              RaceDash Cloud subscription
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
              <p className="text-[10px] text-muted-foreground">Upgrade to Pro for 3 concurrent render slots</p>
            )}
          </div>
        )}
      </section>

      {/* SUBMIT BUTTON / UPLOAD PROGRESS */}
      <section>
        {!cloudUploading ? (
          <Button onClick={onCloudRender} className="w-full gap-2" disabled={isCloudDisabled}>
            <CloudUpload size={14} aria-hidden="true" />
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
                  <span>
                    {formatBytes(uploadProgress.bytesUploaded)} / {formatBytes(uploadProgress.bytesTotal)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="animate-spin h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Preparing upload…</span>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => uploadProgress && window.racedash.cloudRender.cancelUpload(uploadProgress.jobId)}
            >
              Cancel
            </Button>
          </div>
        )}
      </section>
    </>
  )
}
