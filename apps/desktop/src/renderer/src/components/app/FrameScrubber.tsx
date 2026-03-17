import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/loaders/Spinner'
import { InlineTimestampInput } from './InlineTimestampInput'

interface FrameScrubberProps {
  videoPath: string
  fps: number
  totalFrames: number
  currentFrame: number
  onSeek: (frame: number) => void
  onMetadataLoaded?: (totalFrames: number) => void
}


const MAX_RETRIES = 3

export function FrameScrubber({
  videoPath,
  fps,
  totalFrames,
  currentFrame,
  onSeek,
  onMetadataLoaded,
}: FrameScrubberProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const src = videoPath.startsWith('/') ? `media://${videoPath}` : videoPath

  // Seek whenever currentFrame or fps changes — but only once video can seek
  useEffect(() => {
    const video = videoRef.current
    if (!video || video.readyState < 1) return
    video.currentTime = currentFrame / fps
  }, [currentFrame, fps])

  function clamp(frame: number) {
    return Math.max(0, Math.min(frame, totalFrames > 0 ? totalFrames - 1 : frame))
  }

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
          key={retryKey}
          ref={videoRef}
          src={src}
          className="h-full w-full object-contain"
          muted
          preload="auto"
          onLoadedMetadata={() => {
            const video = videoRef.current
            if (!video) return
            const frames = Math.floor(video.duration * fps)
            onMetadataLoaded?.(frames)
            video.currentTime = currentFrame / fps
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
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
          {currentFrame} F
        </div>
      </div>

      {/* Scrub slider */}
      <Slider
        min={0}
        max={totalFrames > 0 ? totalFrames - 1 : 1000}
        value={[currentFrame]}
        onValueChange={([v]) => onSeek(clamp(v))}
        disabled={!videoReady}
      />

      {/* Timecode + step buttons */}
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
