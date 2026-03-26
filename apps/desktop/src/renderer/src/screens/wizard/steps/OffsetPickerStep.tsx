import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FrameScrubber } from '@/components/video/FrameScrubber'
import { useEffect, useState } from 'react'

interface OffsetPickerStepProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  segmentLabel: string
  videoPath: string
  initialFrame: number
  onConfirm: (frame: number) => void
}

const DEFAULT_FPS = 30

export function OffsetPickerStep({
  open,
  onOpenChange,
  segmentLabel,
  videoPath,
  initialFrame,
  onConfirm,
}: OffsetPickerStepProps) {
  const [fps, setFps] = useState(DEFAULT_FPS)
  const [totalFrames, setTotalFrames] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(initialFrame)

  useEffect(() => {
    if (!open) return
    window.racedash
      .getVideoInfo(videoPath)
      .then((info) => {
        setFps(info.fps || DEFAULT_FPS)
        setTotalFrames(Math.floor(info.durationSeconds * (info.fps || DEFAULT_FPS)))
      })
      .catch((err) => {
        console.warn('[racedash] getVideoInfo fallback:', err)
      })
  }, [open, videoPath])

  function seekToFrame(frame: number) {
    const clamped = Math.max(0, Math.min(frame, totalFrames > 0 ? totalFrames - 1 : frame))
    setCurrentFrame(clamped)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-160 max-w-160">
        <DialogHeader>
          <DialogTitle>Set video offset — {segmentLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Scrub to the first frame of the session, then confirm.</p>

        <FrameScrubber
          videoPath={videoPath}
          fps={fps}
          totalFrames={totalFrames}
          currentFrame={currentFrame}
          onSeek={seekToFrame}
          onMetadataLoaded={(frames) => setTotalFrames((prev) => prev || frames)}
        />

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(currentFrame)
              onOpenChange(false)
            }}
          >
            ✓ Use frame {currentFrame}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
