import React, { useMemo } from 'react'
import { FrameScrubber, type FrameScrubberFile } from './FrameScrubber'
import { useMultiVideo } from '@/hooks/useMultiVideo'
import { Spinner } from '@/components/loaders/Spinner'

interface InlineOffsetPickerProps {
  /** All video paths assigned to this segment, in order. */
  videoPaths: string[]
  /** Current frame in the virtual (concatenated) timeline. */
  currentFrame: number
  /** Called when the user scrubs — frame is in the virtual timeline. */
  onFrameChange: (frame: number) => void
}

export function InlineOffsetPicker({
  videoPaths,
  currentFrame,
  onFrameChange,
}: InlineOffsetPickerProps): React.ReactElement {
  const multiInfo = useMultiVideo(videoPaths)

  const files: FrameScrubberFile[] = useMemo(
    () =>
      multiInfo?.files.map((f) => ({
        path: f.path,
        durationSeconds: f.durationSeconds,
        startSeconds: f.startSeconds,
      })) ?? [],
    [multiInfo],
  )

  const fps = multiInfo?.fps ?? 30
  const totalFrames = multiInfo ? Math.round(multiInfo.totalDurationSeconds * fps) : 0

  if (videoPaths.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-accent/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Assign videos to this segment to set the offset
      </div>
    )
  }

  if (!multiInfo) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-accent/40 px-4 py-6">
        <Spinner name="checkerboard" size="1.25rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        <span className="text-xs text-muted-foreground">Loading video info…</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Video offset — scrub to the moment the first lap begins
      </p>
      <FrameScrubber
        files={files}
        fps={fps}
        totalFrames={totalFrames}
        currentFrame={currentFrame}
        onSeek={onFrameChange}
      />
    </div>
  )
}
