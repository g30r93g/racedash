import React, { useCallback, useMemo } from 'react'
import { FrameScrubber } from './FrameScrubber'
import { useMultiVideo, resolveFileAtTime, type FileEntry } from '@/hooks/useMultiVideo'
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

  const files: FileEntry[] = useMemo(
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

  // Map virtual frame → file + local time, then to a local frame for FrameScrubber
  const globalTimeSeconds = currentFrame / fps
  const resolved = files.length > 0 ? resolveFileAtTime(files, globalTimeSeconds) : null
  const activeVideoPath = resolved?.path ?? videoPaths[0] ?? ''
  const localFrame = resolved ? Math.round(resolved.localTime * fps) : currentFrame

  // Map local FrameScrubber seek back to virtual frame
  const handleLocalSeek = useCallback(
    (localFr: number) => {
      if (!resolved || files.length === 0) {
        onFrameChange(localFr)
        return
      }
      const activeFile = files[resolved.fileIndex]
      const globalSeconds = activeFile.startSeconds + localFr / fps
      onFrameChange(Math.round(globalSeconds * fps))
    },
    [resolved, files, fps, onFrameChange],
  )

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

  // For FrameScrubber we need the local file's total frames
  const activeFileInfo = files[resolved?.fileIndex ?? 0]
  const localTotalFrames = activeFileInfo ? Math.round(activeFileInfo.durationSeconds * fps) : totalFrames

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Video offset — scrub to the moment the first lap begins
        </p>
        {videoPaths.length > 1 && (
          <span className="text-[10px] text-muted-foreground">
            File {(resolved?.fileIndex ?? 0) + 1} of {videoPaths.length} · Frame {currentFrame} / {totalFrames}
          </span>
        )}
      </div>
      <FrameScrubber
        videoPath={activeVideoPath}
        fps={fps}
        totalFrames={localTotalFrames}
        currentFrame={localFrame}
        onSeek={handleLocalSeek}
      />
    </div>
  )
}
