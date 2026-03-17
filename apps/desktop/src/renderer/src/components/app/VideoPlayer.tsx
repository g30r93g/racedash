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
  playerRef?: React.RefObject<PlayerRef>
}

interface Size {
  width: number
  height: number
}

export const VideoPlayer = React.forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer({ videoPath, muted = false, onLoadedMetadata, onPlay, onPause, onEnded, overlayType, overlayProps, playerRef }, ref) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const [containerSize, setContainerSize] = React.useState<Size | null>(null)

    React.useLayoutEffect(() => {
      const node = containerRef.current
      if (!node) return

      const updateSize = () => {
        const rect = node.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
          setContainerSize(null)
          return
        }

        setContainerSize((prev) => {
          if (prev?.width === rect.width && prev.height === rect.height) {
            return prev
          }

          return { width: rect.width, height: rect.height }
        })
      }

      updateSize()

      if (typeof ResizeObserver === 'undefined') {
        return
      }

      const observer = new ResizeObserver(() => updateSize())
      observer.observe(node)
      return () => observer.disconnect()
    }, [])

    const overlayLayout = React.useMemo(() => {
      if (!overlayProps || !overlayType || !containerSize) return null

      const entry = registry[overlayType]
      if (!entry) return null

      const referenceVideoWidth = overlayProps.videoWidth ?? entry.width
      const referenceVideoHeight = overlayProps.videoHeight ?? entry.height
      if (referenceVideoWidth <= 0 || referenceVideoHeight <= 0) return null

      const videoScale = Math.min(
        containerSize.width / referenceVideoWidth,
        containerSize.height / referenceVideoHeight,
      )

      const displayedVideoWidth = referenceVideoWidth * videoScale
      const displayedVideoHeight = referenceVideoHeight * videoScale
      const effectiveCompositionWidth = entry.scaleWithVideo
        ? referenceVideoWidth
        : entry.width
      const effectiveCompositionHeight = entry.scaleWithVideo
        ? entry.height * (effectiveCompositionWidth / entry.width)
        : entry.height
      const overlayScale = displayedVideoWidth / referenceVideoWidth

      return {
        compositionWidth: effectiveCompositionWidth,
        compositionHeight: effectiveCompositionHeight,
        left: (containerSize.width - displayedVideoWidth) / 2 + entry.overlayX * overlayScale,
        top: (containerSize.height - displayedVideoHeight) / 2 + entry.overlayY * overlayScale,
        width: effectiveCompositionWidth * overlayScale,
        height: effectiveCompositionHeight * overlayScale,
      }
    }, [containerSize, overlayProps, overlayType])

    return (
      <div ref={containerRef} className="relative flex flex-1 items-center justify-center bg-[#0a0a0a]">
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
        {overlayProps && overlayType && registry[overlayType] && overlayLayout && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: overlayLayout.left,
              top: overlayLayout.top,
              width: overlayLayout.width,
              height: overlayLayout.height,
            }}
          >
            <Player
              ref={playerRef ?? undefined}
              component={registry[overlayType].component}
              compositionWidth={overlayLayout.compositionWidth}
              compositionHeight={overlayLayout.compositionHeight}
              durationInFrames={overlayProps.durationInFrames}
              fps={overlayProps.fps}
              inputProps={overlayProps as unknown as Record<string, unknown>}
              className="pointer-events-none"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                background: 'transparent',
              }}
              renderLoading={() => null}
            />
          </div>
        )}
      </div>
    )
  }
)
