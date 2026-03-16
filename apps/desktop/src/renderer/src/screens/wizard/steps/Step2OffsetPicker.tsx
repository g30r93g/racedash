import React, { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'

interface Step2OffsetPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  segmentLabel: string
  videoPath: string
  initialFrame: number
  onConfirm: (frame: number) => void
}

const DEFAULT_FPS = 30

function formatTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = Math.floor(totalSeconds % 60)
  const ff = frame % fps
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ff).padStart(2, '0')}`
}

export function Step2OffsetPicker({
  open,
  onOpenChange,
  segmentLabel,
  videoPath,
  initialFrame,
  onConfirm,
}: Step2OffsetPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [fps, setFps] = useState(DEFAULT_FPS)
  const [totalFrames, setTotalFrames] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(initialFrame)

  useEffect(() => {
    if (!open) return
    window.racedash.getVideoInfo(videoPath).then((info) => {
      setFps(info.fps || DEFAULT_FPS)
      setTotalFrames(Math.floor(info.durationSeconds * (info.fps || DEFAULT_FPS)))
    }).catch((err) => {
      console.warn('[racedash] getVideoInfo fallback:', err)
    })
  }, [open, videoPath])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = currentFrame / fps
  }, [currentFrame, fps])

  function seekToFrame(frame: number) {
    const clamped = Math.max(0, Math.min(frame, totalFrames > 0 ? totalFrames - 1 : frame))
    setCurrentFrame(clamped)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[640px] max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Set video offset — {segmentLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Scrub to the first frame of the session, then confirm.
        </p>

        <div className="relative overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            src={videoPath.startsWith('/') ? `file://${videoPath}` : videoPath}
            className="h-full w-full object-contain"
            muted
            preload="metadata"
            onLoadedMetadata={() => {
              const video = videoRef.current
              if (video && totalFrames === 0) {
                setTotalFrames(Math.floor(video.duration * fps))
              }
            }}
          />
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-mono text-white">
            {currentFrame} F
          </div>
        </div>

        <Slider
          min={0}
          max={totalFrames > 0 ? totalFrames - 1 : 1000}
          value={[currentFrame]}
          onValueChange={([v]) => seekToFrame(v)}
          className="w-full"
        />

        <p className="text-center font-mono text-xs text-muted-foreground">
          {formatTime(currentFrame, fps)}
        </p>

        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame - 10)}>⏮ -10</Button>
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame - 1)}>← Prev</Button>
          <span className="w-20 text-center font-mono text-xs text-foreground">{formatTime(currentFrame, fps)}</span>
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame + 1)}>Next →</Button>
          <Button variant="outline" size="sm" onClick={() => seekToFrame(currentFrame + 10)}>+10 ⏭</Button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm(currentFrame); onOpenChange(false) }}>
            ✓ Use frame {currentFrame}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
