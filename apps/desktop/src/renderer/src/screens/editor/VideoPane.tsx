import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { type PlayerRef } from '@remotion/player'
import type { OverlayProps } from '@racedash/core'
import type { OverlayType } from '@/screens/editor/tabs/OverlayPickerModal'
import type { MultiVideoInfo } from '../../../../types/ipc'
import type { CutRegion } from '../../../../types/videoEditing'
import { toSourceFrame } from '../../lib/videoEditing'
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
  /** When set and skipCutRegions is true, playback auto-skips over these frame ranges. */
  cutRegions?: CutRegion[]
  /** Enable cut-region skipping during playback (Project view). */
  skipCutRegions?: boolean
  /** Display duration for playback controls (output duration in Project view). */
  displayDuration?: number
  /** Maps source seconds to display seconds for playback controls (Project view). */
  mapTimeToDisplay?: (sourceSeconds: number) => number
}

export const VideoPane = React.forwardRef<VideoPaneHandle, VideoPaneProps>(function VideoPane(
  { multiVideoInfo, onTimeUpdate, onPlayingChange, overlayType, overlayProps, cutRegions, skipCutRegions, displayDuration: displayDurationProp, mapTimeToDisplay },
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

  // Sorted cut regions in seconds for skip logic
  const cutRangesSeconds = React.useMemo(() => {
    if (!cutRegions?.length || !skipCutRegions) return []
    return [...cutRegions]
      .sort((a, b) => a.startFrame - b.startFrame)
      .map((c) => ({ startSec: c.startFrame / fps, endSec: c.endFrame / fps }))
  }, [cutRegions, skipCutRegions, fps])

  // rAF loop — compute global time from local video time + file start offset
  useEffect(() => {
    if (!playing || !activeFile) return
    let rafId: number
    const tick = () => {
      const localT = videoRef.current?.currentTime ?? 0
      let global = activeFile.startSeconds + localT

      // Skip over cut regions in Project view
      for (const cut of cutRangesSeconds) {
        if (global >= cut.startSec && global < cut.endSec) {
          // Seek to end of cut
          const resolved = resolveFileAtTime(files, cut.endSec)
          activeFileIndexRef.current = resolved.fileIndex
          setActiveFileIndex(resolved.fileIndex)
          if (videoRef.current) {
            videoRef.current.currentTime = resolved.localTime
          }
          global = cut.endSec
          break
        }
      }

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
  }, [playing, activeFile, onTimeUpdate, overlayProps?.fps, files.length, cutRangesSeconds, files])

  const handlePlay = useCallback(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  const handlePause = useCallback(() => {
    videoRef.current?.pause()
  }, [])

  /** Seek to an absolute source-time position. Used by the imperative handle and internally. */
  const seekToSource = useCallback(
    (globalT: number) => {
      if (files.length === 0) return
      const resolved = resolveFileAtTime(files, globalT)

      activeFileIndexRef.current = resolved.fileIndex
      setActiveFileIndex(resolved.fileIndex)
      setGlobalTime(globalT)
      globalTimeRef.current = globalT
      onTimeUpdate?.(globalT)

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

  /** Seek handler for the slider — in Project view the slider emits display time, so convert back. */
  const handleSliderSeek = useCallback(
    (seekTime: number) => {
      const sourceTime = skipCutRegions && cutRegions?.length
        ? toSourceFrame(Math.round(seekTime * fps), cutRegions, [], fps) / fps
        : seekTime
      seekToSource(sourceTime)
    },
    [skipCutRegions, cutRegions, fps, seekToSource],
  )

  useImperativeHandle(ref, () => ({ seek: seekToSource, play: handlePlay, pause: handlePause }), [
    seekToSource,
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
        onSeek={handleSliderSeek}
        onMuteToggle={() => setMuted((m) => !m)}
        displayDuration={displayDurationProp}
        displayCurrentTime={mapTimeToDisplay ? mapTimeToDisplay(globalTime) : undefined}
      />
    </div>
  )
})
