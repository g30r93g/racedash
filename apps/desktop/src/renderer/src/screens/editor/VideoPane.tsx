import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { type PlayerRef } from '@remotion/player'
import type { OverlayProps } from '@racedash/core'
import type { OverlayType } from '@/screens/editor/tabs/OverlayPickerModal'
import type { MultiVideoInfo } from '../../../../types/ipc'
import { resolveFileAtTime } from '@/hooks/useMultiVideo'
import { VideoPlayer } from '@/components/video/VideoPlayer'
import { VideoPlaybackControls } from '@/components/video/VideoPlaybackControls'

export interface VideoPaneHandle {
  seek: (time: number) => void
  play: () => void
  pause: () => void
}

interface VideoPaneProps {
  multiVideoInfo: MultiVideoInfo | null
  onTimeUpdate?: (currentTime: number) => void
  onPlayingChange?: (playing: boolean) => void
  overlayType?: OverlayType
  overlayProps?: OverlayProps
}

export const VideoPane = React.forwardRef<VideoPaneHandle, VideoPaneProps>(function VideoPane(
  { multiVideoInfo, onTimeUpdate, onPlayingChange, overlayType, overlayProps },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<PlayerRef>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [globalTime, setGlobalTime] = useState(0)
  const [activeFileIndex, setActiveFileIndex] = useState(0)
  const activeFileIndexRef = useRef(0)
  const globalTimeRef = useRef(0)

  const files = multiVideoInfo?.files ?? []
  const fps = multiVideoInfo?.fps ?? 60
  const totalDuration = multiVideoInfo?.totalDurationSeconds ?? 0
  const activeFile = files[activeFileIndex]
  const videoPath = activeFile?.path

  // Keep globalTimeRef in sync
  useEffect(() => {
    globalTimeRef.current = globalTime
  }, [globalTime])

  // rAF loop — compute global time from local video time + file start offset
  useEffect(() => {
    if (!playing || !activeFile) return
    let rafId: number
    const tick = () => {
      const localT = videoRef.current?.currentTime ?? 0
      const global = activeFile.startSeconds + localT

      setGlobalTime(global)
      globalTimeRef.current = global
      onTimeUpdate?.(global)

      // Auto-advance to next file
      if (localT >= activeFile.durationSeconds - 0.05 && activeFileIndexRef.current < files.length - 1) {
        const nextIndex = activeFileIndexRef.current + 1
        activeFileIndexRef.current = nextIndex
        setActiveFileIndex(nextIndex)
        return // Stop rAF — new src load will restart playback
      }

      const overlayFps = overlayProps?.fps
      if (overlayFps != null) {
        playerRef.current?.seekTo(Math.round(global * overlayFps))
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [playing, activeFile, onTimeUpdate, overlayProps?.fps, files.length])

  const handlePlay = useCallback(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  const handlePause = useCallback(() => {
    videoRef.current?.pause()
  }, [])

  const handleSeek = useCallback(
    (globalT: number) => {
      if (files.length === 0) return
      const resolved = resolveFileAtTime(files, globalT)

      // Always update ref + state for the active file
      activeFileIndexRef.current = resolved.fileIndex
      setActiveFileIndex(resolved.fileIndex)
      setGlobalTime(globalT)
      globalTimeRef.current = globalT
      onTimeUpdate?.(globalT)

      // Set the local time on the video element — works whether it's the same
      // file or a different one (if different, onLoadedMetadata will also seek,
      // but setting it here handles the same-file case immediately).
      if (videoRef.current) {
        videoRef.current.currentTime = resolved.localTime
      }

      const overlayFps = overlayProps?.fps
      if (overlayFps != null) {
        playerRef.current?.seekTo(Math.round(globalT * overlayFps))
      }
    },
    [files, onTimeUpdate, overlayProps?.fps],
  )

  useImperativeHandle(ref, () => ({ seek: handleSeek, play: handlePlay, pause: handlePause }), [
    handleSeek,
    handlePlay,
    handlePause,
  ])

  // When the video element loads new src (file switch), seek to correct position + auto-play
  const handleLoadedMetadata = useCallback(
    (_duration: number) => {
      const file = files[activeFileIndexRef.current]
      if (!file) return
      const expectedLocalTime = globalTimeRef.current - file.startSeconds
      if (expectedLocalTime > 0.1 && videoRef.current) {
        videoRef.current.currentTime = expectedLocalTime
      }
      if (playing) {
        videoRef.current?.play().catch(() => {})
      }
    },
    [files, playing],
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <VideoPlayer
        ref={videoRef}
        videoPath={videoPath}
        muted={muted}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => {
          setPlaying(true)
          onPlayingChange?.(true)
        }}
        onPause={() => {
          setPlaying(false)
          onPlayingChange?.(false)
        }}
        onEnded={() => {
          // If there are more files, the rAF tick will auto-advance; don't stop.
          if (activeFileIndexRef.current < files.length - 1) return
          setPlaying(false)
          onPlayingChange?.(false)
        }}
        overlayType={overlayType}
        overlayProps={overlayProps}
        playerRef={playerRef}
      />
      <VideoPlaybackControls
        duration={totalDuration}
        currentTime={globalTime}
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
})
