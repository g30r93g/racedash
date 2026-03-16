import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/loaders/Spinner'

interface FrameScrubberProps {
  videoPath: string
  fps: number
  totalFrames: number
  currentFrame: number
  onSeek: (frame: number) => void
  onMetadataLoaded?: (totalFrames: number) => void
}

function formatTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const mm = Math.floor(totalSeconds / 60)
  const ss = Math.floor(totalSeconds % 60)
  const ms = Math.floor((totalSeconds % 1) * 1000)
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

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

  return (
    <div className="flex flex-col gap-3">
      {/* Video preview */}
      <div className="relative overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16/9' }}>
        <video
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
        />
        {!videoReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black">
            <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" ignoreReducedMotion />
            <span className="font-mono text-[11px] text-muted-foreground">Loading video…</span>
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
      />

      {/* Timecode + step buttons */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onSeek(clamp(currentFrame - 10))}>
          ⏮ -10
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSeek(clamp(currentFrame - 1))}>
          ← Prev
        </Button>
        <span className="w-24 text-center font-mono text-xs text-foreground">
          {formatTime(currentFrame, fps)}
        </span>
        <Button variant="outline" size="sm" onClick={() => onSeek(clamp(currentFrame + 1))}>
          Next →
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSeek(clamp(currentFrame + 10))}>
          +10 ⏭
        </Button>
      </div>
    </div>
  )
}
