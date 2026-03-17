import React from 'react'

interface VideoPlayerProps {
  videoPath?: string
  onTimeUpdate?: (currentTime: number) => void
  onLoadedMetadata?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ videoPath, onTimeUpdate, onLoadedMetadata, onPlay, onPause, onEnded }, ref) {
    return (
      <div className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
        {videoPath ? (
          <video
            ref={ref}
            src={`media://${videoPath}`}
            className="h-full w-full object-contain"
            muted
            preload="metadata"
            onTimeUpdate={(e) => onTimeUpdate?.((e.target as HTMLVideoElement).currentTime)}
            onLoadedMetadata={(e) => onLoadedMetadata?.((e.target as HTMLVideoElement).duration)}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <polygon points="14,10 38,24 14,38" fill="#3a3a3a" />
            </svg>
            <span className="text-xs tracking-widest text-muted-foreground">NO VIDEO LOADED</span>
          </div>
        )}
        <div className="absolute bottom-3 right-4">
          <span className="font-mono text-xs text-muted-foreground">00:00:00.000</span>
        </div>
      </div>
    )
  }
)
