import React from 'react'

interface VideoPlayerProps {
  videoPath?: string
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ videoPath }, ref) {
    return (
      <div className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
        {videoPath ? (
          <video
            ref={ref}
            src={`file://${videoPath}`}
            className="h-full w-full object-contain"
            muted
            preload="metadata"
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
