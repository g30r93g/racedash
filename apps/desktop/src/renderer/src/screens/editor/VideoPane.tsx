import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { type PlayerRef } from '@remotion/player'
import type { OverlayProps } from '@racedash/core'
import type { OverlayType } from '@/screens/editor/tabs/OverlayPickerModal'
import { VideoPlayer } from '@/components/app/VideoPlayer'
import { VideoPlaybackControls } from '@/components/app/VideoPlaybackControls'

export interface VideoPaneHandle {
  seek: (time: number) => void
  pause: () => void
}

interface VideoPaneProps {
  videoPath?: string
  fps?: number
  onTimeUpdate?: (currentTime: number) => void
  onPlayingChange?: (playing: boolean) => void
  overlayType?: OverlayType
  overlayProps?: OverlayProps
}

export const VideoPane = React.forwardRef<VideoPaneHandle, VideoPaneProps>(
  function VideoPane({ videoPath, fps = 60, onTimeUpdate, onPlayingChange, overlayType, overlayProps }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const playerRef = useRef<PlayerRef>(null)
    const [playing, setPlaying] = useState(false)
    const [muted, setMuted] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)

    // rAF loop for smooth ~60fps timecode updates while playing
    useEffect(() => {
      if (!playing) return
      let rafId: number
      const tick = () => {
        const t = videoRef.current?.currentTime ?? 0
        setCurrentTime(t)
        onTimeUpdate?.(t)
        const overlayFps = overlayProps?.fps
        if (overlayFps != null) {
          playerRef.current?.seekTo(Math.round(t * overlayFps))
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(rafId)
    }, [playing, onTimeUpdate, overlayProps?.fps])

    const handlePlay = useCallback(() => {
      videoRef.current?.play().catch(() => {})
    }, [])

    const handlePause = useCallback(() => {
      videoRef.current?.pause()
    }, [])

    const handleSeek = useCallback((time: number) => {
      if (videoRef.current) videoRef.current.currentTime = time
      setCurrentTime(time)
      onTimeUpdate?.(time)
      const overlayFps = overlayProps?.fps
      if (overlayFps != null) {
        playerRef.current?.seekTo(Math.round(time * overlayFps))
      }
    }, [onTimeUpdate, overlayProps?.fps])

    useImperativeHandle(ref, () => ({ seek: handleSeek, pause: handlePause }), [handleSeek, handlePause])

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <VideoPlayer
          ref={videoRef}
          videoPath={videoPath}
          muted={muted}
          onLoadedMetadata={setDuration}
          onPlay={() => { setPlaying(true); onPlayingChange?.(true) }}
          onPause={() => { setPlaying(false); onPlayingChange?.(false) }}
          onEnded={() => { setPlaying(false); onPlayingChange?.(false) }}
          overlayType={overlayType}
          overlayProps={overlayProps}
          playerRef={playerRef}
        />
        <VideoPlaybackControls
          duration={duration}
          currentTime={currentTime}
          fps={fps}
          playing={playing}
          muted={muted}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={handleSeek}
          onMuteToggle={() => setMuted((m) => !m)}
        />
      </div>
    )
  }
)
