// apps/desktop/src/renderer/src/components/video/InlineOffsetPicker.tsx
import React, { useEffect, useState } from 'react'
import { FrameScrubber } from './FrameScrubber'

interface InlineOffsetPickerProps {
  videoPath: string
  currentFrame: number
  onFrameChange: (frame: number) => void
}

export function InlineOffsetPicker({
  videoPath,
  currentFrame,
  onFrameChange,
}: InlineOffsetPickerProps): React.ReactElement {
  const [fps, setFps] = useState(30)
  const [totalFrames, setTotalFrames] = useState(0)

  useEffect(() => {
    if (!videoPath) return
    let cancelled = false
    window.racedash
      .getVideoInfo(videoPath)
      .then((info) => {
        if (cancelled) return
        setFps(info.fps)
        setTotalFrames(Math.round(info.duration * info.fps))
      })
      .catch((err: unknown) => {
        console.error('[InlineOffsetPicker] getVideoInfo failed:', err)
      })
    return () => { cancelled = true }
  }, [videoPath])

  if (!videoPath) {
    return (
      <div className="rounded-lg border border-border bg-accent/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Assign videos to this segment to set the offset
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Video offset — scrub to the moment the first lap begins
      </p>
      <FrameScrubber
        videoPath={videoPath}
        fps={fps}
        totalFrames={totalFrames}
        currentFrame={currentFrame}
        onSeek={onFrameChange}
        onMetadataLoaded={setTotalFrames}
      />
    </div>
  )
}
