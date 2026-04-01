import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/loaders/Spinner'
import { InlineTimestampInput } from '../timing/InlineTimestampInput'

/** Info about a single file in a multi-file virtual timeline. */
export interface FrameScrubberFile {
  path: string
  durationSeconds: number
  /** Cumulative start time in the virtual timeline (seconds). */
  startSeconds: number
}

interface FrameScrubberProps {
  /** Single video path (legacy, simple case). Ignored if `files` is provided. */
  videoPath?: string
  /** Multi-file virtual timeline. When provided, `videoPath` is ignored. */
  files?: FrameScrubberFile[]
  fps: number
  totalFrames: number
  /** Current frame in the virtual (concatenated) timeline. */
  currentFrame: number
  onSeek: (frame: number) => void
  onMetadataLoaded?: (totalFrames: number) => void
}

const MAX_RETRIES = 3

/**
 * Resolve which file is active at a given global time.
 * Returns the file index and local time within that file.
 */
function resolveFile(
  files: FrameScrubberFile[],
  globalTimeSeconds: number,
): { fileIndex: number; localTime: number } {
  const clamped = Math.max(0, globalTimeSeconds)
  for (let i = files.length - 1; i >= 0; i--) {
    if (clamped >= files[i].startSeconds) {
      const localTime = Math.min(clamped - files[i].startSeconds, files[i].durationSeconds)
      return { fileIndex: i, localTime }
    }
  }
  return { fileIndex: 0, localTime: 0 }
}

export function FrameScrubber({
  videoPath,
  files,
  fps,
  totalFrames,
  currentFrame,
  onSeek,
  onMetadataLoaded,
}: FrameScrubberProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [activeFileIndex, setActiveFileIndex] = useState(0)

  // Build the effective file list — either from `files` prop or single `videoPath`
  const effectiveFiles: FrameScrubberFile[] = files ?? (videoPath
    ? [{ path: videoPath, durationSeconds: totalFrames / (fps || 30), startSeconds: 0 }]
    : [])

  const isMultiFile = effectiveFiles.length > 1

  // Resolve which file should be playing at the current virtual frame
  const globalTimeSeconds = currentFrame / (fps || 30)
  const resolved = effectiveFiles.length > 0
    ? resolveFile(effectiveFiles, globalTimeSeconds)
    : { fileIndex: 0, localTime: 0 }

  const activeFile = effectiveFiles[resolved.fileIndex]
  const activePath = activeFile?.path ?? videoPath ?? ''
  const src = activePath.startsWith('/') ? `media://${activePath}` : activePath

  // When the active file changes, we need to switch the video src
  useEffect(() => {
    if (resolved.fileIndex !== activeFileIndex) {
      setActiveFileIndex(resolved.fileIndex)
      setVideoReady(false)
    }
  }, [resolved.fileIndex, activeFileIndex])

  // Seek whenever currentFrame or fps changes — but only once video can seek.
  // Add half a frame duration to the seek time to land in the middle of the
  // target frame rather than on its boundary. Without this, the video element
  // may snap to the previous decoded frame for non-integer fps (e.g. 59.94).
  const halfFrameSeconds = 0.5 / (fps || 30)
  useEffect(() => {
    const video = videoRef.current
    if (!video || video.readyState < 1) return
    video.currentTime = resolved.localTime + halfFrameSeconds
  }, [currentFrame, fps, resolved.localTime, halfFrameSeconds])

  const clamp = useCallback(
    (frame: number) => Math.max(0, Math.min(frame, totalFrames > 0 ? totalFrames - 1 : frame)),
    [totalFrames],
  )

  function handleVideoError() {
    const video = videoRef.current
    const err = video?.error
    console.error(
      `[FrameScrubber] Video load error (attempt ${retryKey + 1}):`,
      err ? `code=${err.code} message=${err.message}` : 'unknown',
    )
    if (retryKey < MAX_RETRIES) {
      console.warn(`[FrameScrubber] Retrying (${retryKey + 1}/${MAX_RETRIES})…`)
      setVideoReady(false)
      setRetryKey((k) => k + 1)
    } else {
      console.error('[FrameScrubber] Max retries reached, giving up.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Video preview */}
      <div className="relative overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16/9' }}>
        <video
          key={`${activeFileIndex}-${retryKey}`}
          ref={videoRef}
          src={src}
          className="h-full w-full object-contain"
          muted
          preload="auto"
          onLoadedMetadata={() => {
            const video = videoRef.current
            if (!video) return
            // For single-file mode, report total frames
            if (!isMultiFile) {
              const frames = Math.floor(video.duration * fps)
              onMetadataLoaded?.(frames)
            }
            video.currentTime = resolved.localTime + halfFrameSeconds
          }}
          onCanPlay={() => setVideoReady(true)}
          onError={handleVideoError}
        />
        {!videoReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
            <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
            <span className="font-mono text-[11px] text-muted-foreground">
              {retryKey > 0 ? `Retrying… (${retryKey}/${MAX_RETRIES})` : 'Loading video…'}
            </span>
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          {isMultiFile && (
            <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white/60">
              File {resolved.fileIndex + 1}/{effectiveFiles.length}
            </span>
          )}
          <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {currentFrame} F
          </span>
        </div>
      </div>

      {/* Scrub slider — always operates in virtual frame space */}
      <Slider
        min={0}
        max={totalFrames > 0 ? totalFrames - 1 : 1000}
        value={[currentFrame]}
        onValueChange={([v]) => onSeek(clamp(v))}
        disabled={!videoReady}
      />

      {/* Timecode + step buttons — all in virtual frame space */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" disabled={!videoReady} onClick={() => onSeek(clamp(currentFrame - 10))}>
          ⏮ -10
        </Button>
        <Button variant="outline" size="sm" disabled={!videoReady} onClick={() => onSeek(clamp(currentFrame - 1))}>
          ← Prev
        </Button>
        <InlineTimestampInput currentFrame={currentFrame} fps={fps} onSeek={onSeek} />
        <Button variant="outline" size="sm" disabled={!videoReady} onClick={() => onSeek(clamp(currentFrame + 1))}>
          Next →
        </Button>
        <Button variant="outline" size="sm" disabled={!videoReady} onClick={() => onSeek(clamp(currentFrame + 10))}>
          +10 ⏭
        </Button>
      </div>
    </div>
  )
}
