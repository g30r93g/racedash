import React, { useEffect, useRef, useState } from 'react'

interface Step2OffsetPickerProps {
  segmentLabel: string
  videoPath: string
  initialFrame: number
  onConfirm: (frame: number) => void
  onCancel: () => void
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
  segmentLabel,
  videoPath,
  initialFrame,
  onConfirm,
  onCancel,
}: Step2OffsetPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [fps, setFps] = useState(DEFAULT_FPS)
  const [totalFrames, setTotalFrames] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(initialFrame)

  useEffect(() => {
    window.racedash.getVideoInfo(videoPath).then((info) => {
      setFps(info.fps || DEFAULT_FPS)
      setTotalFrames(Math.floor(info.durationSeconds * (info.fps || DEFAULT_FPS)))
    }).catch(() => {
      // Fall back to defaults if getVideoInfo not yet implemented
    })
  }, [videoPath])

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="flex w-[640px] flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Set video offset — {segmentLabel}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Scrub to the first frame of the session, then confirm.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-md bg-black" style={{ aspectRatio: '16/9' }}>
          <video
            ref={videoRef}
            src={videoPath.startsWith('/') ? `file://${videoPath}` : videoPath}
            className="h-full w-full object-contain"
            muted
            preload="metadata"
          />
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-mono text-white">
            {currentFrame} F
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={totalFrames > 0 ? totalFrames - 1 : 1000}
          value={currentFrame}
          onChange={(e) => seekToFrame(Number(e.target.value))}
          className="w-full accent-primary"
        />

        <p className="text-center font-mono text-xs text-muted-foreground">
          {formatTime(currentFrame, fps)}
        </p>

        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => seekToFrame(currentFrame - 10)} className="rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">⏮ -10</button>
          <button type="button" onClick={() => seekToFrame(currentFrame - 1)} className="rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">← Prev</button>
          <span className="w-20 text-center font-mono text-xs text-foreground">{formatTime(currentFrame, fps)}</span>
          <button type="button" onClick={() => seekToFrame(currentFrame + 1)} className="rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">Next →</button>
          <button type="button" onClick={() => seekToFrame(currentFrame + 10)} className="rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">+10 ⏭</button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onCancel} className="rounded px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(currentFrame)} className="rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground">
            ✓ Use frame {currentFrame}
          </button>
        </div>
      </div>
    </div>
  )
}
