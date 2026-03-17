import React from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import type { OverlayProps } from '@racedash/core'
import type { OverlayType } from '@/screens/editor/tabs/OverlayPickerModal'
import { registry } from '@renderer/registry'

interface VideoPlayerProps {
  videoPath?: string
  muted?: boolean
  onLoadedMetadata?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  overlayType?: OverlayType
  overlayProps?: OverlayProps
  playerRef?: React.RefObject<PlayerRef | null>
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ videoPath, muted = false, onLoadedMetadata, onPlay, onPause, onEnded, overlayType, overlayProps, playerRef }, ref) {
    return (
      <div className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
        {videoPath ? (
          <video
            ref={ref}
            src={`media://${videoPath}`}
            className="h-full w-full object-contain"
            muted={muted}
            preload="metadata"
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
        {overlayProps && overlayType && registry[overlayType] && (
          <Player
            ref={playerRef ?? undefined}
            component={registry[overlayType].component}
            compositionWidth={registry[overlayType].width}
            compositionHeight={registry[overlayType].height}
            durationInFrames={overlayProps.durationInFrames}
            fps={overlayProps.fps}
            inputProps={overlayProps as Record<string, unknown>}
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'transparent' }}
            renderLoading={() => null}
          />
        )}
      </div>
    )
  }
)
