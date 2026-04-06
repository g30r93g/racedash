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

  // Track whether we're in the middle of a cut-skip seek to suppress the pause event
  const skipSeekingRef = useRef(false)
  // Track whether a file switch is due to a cut-skip (force play on loadedMetadata)
  const cutSkipFileChangeRef = useRef(false)

  // rAF loop — compute global time from local video time + file start offset
  useEffect(() => {
    console.log('[VideoPane] rAF effect', { playing, activeFileIndex, activeFilePath: activeFile?.path })
    if (!playing || !activeFile) return
    let rafId: number
    const tick = () => {
      // While a cross-file cut-skip is in progress, keep the loop alive
      // but don't read the video element — it's loading the new source.
      if (cutSkipFileChangeRef.current) {
        console.log('[CutSkip] rAF tick: waiting for file load...')
        rafId = requestAnimationFrame(tick)
        return
      }

      const video = videoRef.current
      if (!video) { rafId = requestAnimationFrame(tick); return }

      const localT = video.currentTime
      let global = activeFile.startSeconds + localT

      // Skip over cut regions in Project view
      // Add one frame of padding past cut.endSec to avoid floating-point re-entry
      const frameDuration = 1 / fps
      for (const cut of cutRangesSeconds) {
        if (global >= cut.startSec && global < cut.endSec) {
          const skipTarget = cut.endSec + frameDuration
          console.log('[CutSkip] Hit cut region', { global, cutStart: cut.startSec, cutEnd: cut.endSec, skipTarget })
          const resolved = resolveFileAtTime(files, skipTarget)
          console.log('[CutSkip] Resolved target', { targetFileIndex: resolved.fileIndex, currentFileIndex: activeFileIndexRef.current, localTime: resolved.localTime })

          if (resolved.fileIndex !== activeFileIndexRef.current) {
            console.log('[CutSkip] Cross-file: switching from', activeFileIndexRef.current, 'to', resolved.fileIndex)
            cutSkipFileChangeRef.current = true
            activeFileIndexRef.current = resolved.fileIndex
            setActiveFileIndex(resolved.fileIndex)
            globalTimeRef.current = skipTarget
            setGlobalTime(skipTarget)
            onTimeUpdate?.(skipTarget)
            return // Stop rAF — file switch will restart via canplay effect
          }

          // Same file — seek directly without going through state
          console.log('[CutSkip] Same-file: seeking to', resolved.localTime)
          skipSeekingRef.current = true
          video.currentTime = resolved.localTime
          global = skipTarget
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
      console.log('[VideoPane] loadedMetadata', { cutSkipFileChange: cutSkipFileChangeRef.current, playing })
      // Cut-skip file changes are handled by the dedicated effect below
      if (cutSkipFileChangeRef.current) return
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

  // Dedicated effect for resuming playback after a cross-file cut-skip.
  // We must wait for the new src to be applied to the DOM (after React render)
  // then call load() and wait for canplay before seeking + playing.
  useEffect(() => {
    console.log('[CutSkip] canplay effect running', { cutSkipFileChangeRef: cutSkipFileChangeRef.current, activeFileIndex, videoSrc: videoRef.current?.src })
    if (!cutSkipFileChangeRef.current) return
    const video = videoRef.current
    if (!video) {
      console.log('[CutSkip] canplay effect: no video ref!')
      return
    }

    console.log('[CutSkip] canplay effect: setting up listener, video.src=', video.src, 'readyState=', video.readyState)

    const resume = () => {
      console.log('[CutSkip] canplay fired!', { cutSkipFileChangeRef: cutSkipFileChangeRef.current, readyState: video.readyState, src: video.src })
      if (!cutSkipFileChangeRef.current) return
      cutSkipFileChangeRef.current = false
      const file = files[activeFileIndexRef.current]
      if (!file) {
        console.log('[CutSkip] resume: no file at index', activeFileIndexRef.current)
        return
      }
      const expectedLocalTime = globalTimeRef.current - file.startSeconds
      console.log('[CutSkip] resume: seeking to localTime=', expectedLocalTime, 'globalTime=', globalTimeRef.current, 'fileStart=', file.startSeconds)
      if (expectedLocalTime > 0.1) {
        video.currentTime = expectedLocalTime
      }
      setPlaying(true)
      onPlayingChange?.(true)
      video.play().catch((err) => console.warn('[CutSkip] play() failed:', err))
    }

    // Always load + wait for canplay. Don't trust readyState — it reflects
    // the OLD source until load() completes with the new src.
    video.addEventListener('canplay', resume, { once: true })
    console.log('[CutSkip] calling video.load()')
    video.load()
    return () => {
      console.log('[CutSkip] canplay effect cleanup')
      video.removeEventListener('canplay', resume)
    }
  }, [activeFileIndex, files, onPlayingChange])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <VideoPlayer
        ref={videoRef}
        videoPath={videoPath}
        muted={muted}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => {
          console.log('[VideoPane] onPlay')
          setPlaying(true)
          onPlayingChange?.(true)
        }}
        onPause={() => {
          console.log('[VideoPane] onPause', { skipSeeking: skipSeekingRef.current, cutSkipFileChange: cutSkipFileChangeRef.current })
          // Suppress pause events caused by cut-skip seeks (same-file)
          if (skipSeekingRef.current) {
            skipSeekingRef.current = false
            videoRef.current?.play().catch(() => {})
            return
          }
          // Suppress pause events caused by src unload during cut-skip file change
          if (cutSkipFileChangeRef.current) return
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
