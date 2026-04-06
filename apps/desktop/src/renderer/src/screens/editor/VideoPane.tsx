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
  /** Resolved transitions for CSS preview. Each has a source-time position and type/duration. */
  transitionPreview?: Array<{
    sourceTimeSec: number
    type: 'fadeFromBlack' | 'fadeToBlack' | 'fadeThroughBlack' | 'crossfade'
    durationMs: number
    position: 'start' | 'end' | 'seam'
  }>
}

export const VideoPane = React.forwardRef<VideoPaneHandle, VideoPaneProps>(function VideoPane(
  { multiVideoInfo, onTimeUpdate, onPlayingChange, overlayType, overlayProps, cutRegions, skipCutRegions, displayDuration: displayDurationProp, mapTimeToDisplay, transitionPreview },
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

  // Timestamp until which pause events should be suppressed (cut-skip seeks can fire multiple pause/play cycles)
  const suppressPauseUntilRef = useRef(0)
  // Track whether a file switch is due to a cut-skip (force play on canplay)
  const cutSkipFileChangeRef = useRef(false)

  // rAF loop — compute global time from local video time + file start offset
  useEffect(() => {
    if (!playing || !activeFile) return
    let rafId: number
    const tick = () => {
      // While a cross-file cut-skip is in progress, keep the loop alive
      // but don't read the video element — it's loading the new source.
      if (cutSkipFileChangeRef.current) {
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
          const resolved = resolveFileAtTime(files, skipTarget)

          if (resolved.fileIndex !== activeFileIndexRef.current) {
            cutSkipFileChangeRef.current = true
            activeFileIndexRef.current = resolved.fileIndex
            setActiveFileIndex(resolved.fileIndex)
            globalTimeRef.current = skipTarget
            setGlobalTime(skipTarget)
            onTimeUpdate?.(skipTarget)
            return // Stop rAF — file switch will restart via canplay effect
          }

          // Same file — seek directly without going through state
          suppressPauseUntilRef.current = Date.now() + 500
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
    if (!cutSkipFileChangeRef.current) return
    const video = videoRef.current
    if (!video) return

    const resume = () => {
      if (!cutSkipFileChangeRef.current) return
      cutSkipFileChangeRef.current = false
      const file = files[activeFileIndexRef.current]
      if (!file) return
      const expectedLocalTime = globalTimeRef.current - file.startSeconds
      if (expectedLocalTime > 0.1) {
        suppressPauseUntilRef.current = Date.now() + 500
        video.currentTime = expectedLocalTime
      }
      setPlaying(true)
      onPlayingChange?.(true)
      video.play().catch(() => {})
    }

    // Always load + wait for canplay. Don't trust readyState — it reflects
    // the OLD source until load() completes with the new src.
    video.addEventListener('canplay', resume, { once: true })
    video.load()
    return () => video.removeEventListener('canplay', resume)
  }, [activeFileIndex, files, onPlayingChange])

  // Compute CSS opacity for transition preview.
  // Returns 0 (fully black) to 1 (fully visible) based on proximity to transition boundaries.
  const transitionOpacity = React.useMemo(() => {
    if (!transitionPreview?.length) return 1
    // Debug: uncomment to verify data flow
    // console.log('[TransitionPreview]', { globalTime, transitions: transitionPreview })
    const t = globalTime
    for (const tr of transitionPreview) {
      const durSec = tr.durationMs / 1000
      const halfDur = durSec / 2

      if (tr.position === 'start' && (tr.type === 'fadeFromBlack' || tr.type === 'fadeThroughBlack')) {
        // Fade in at project start: opacity ramps 0→1 over duration
        if (t < tr.sourceTimeSec + durSec) {
          return Math.min(1, Math.max(0, (t - tr.sourceTimeSec) / durSec))
        }
      }

      if (tr.position === 'end' && (tr.type === 'fadeToBlack' || tr.type === 'fadeThroughBlack')) {
        // Fade out at project end: opacity ramps 1→0 over duration
        const fadeStart = tr.sourceTimeSec - durSec
        if (t > fadeStart) {
          return Math.min(1, Math.max(0, (tr.sourceTimeSec - t) / durSec))
        }
      }

      if (tr.position === 'seam') {
        if (tr.type === 'crossfade' || tr.type === 'fadeThroughBlack') {
          // Approximate as fade-out then fade-in around the seam point
          const fadeOutStart = tr.sourceTimeSec - halfDur
          const fadeInEnd = tr.sourceTimeSec + halfDur
          if (t >= fadeOutStart && t < tr.sourceTimeSec) {
            // Fading out
            return Math.max(0, (tr.sourceTimeSec - t) / halfDur)
          }
          if (t >= tr.sourceTimeSec && t < fadeInEnd) {
            // Fading in
            return Math.max(0, (t - tr.sourceTimeSec) / halfDur)
          }
        }
        if (tr.type === 'fadeToBlack') {
          const fadeStart = tr.sourceTimeSec - durSec
          if (t >= fadeStart && t < tr.sourceTimeSec) {
            return Math.max(0, (tr.sourceTimeSec - t) / durSec)
          }
        }
        if (tr.type === 'fadeFromBlack') {
          if (t >= tr.sourceTimeSec && t < tr.sourceTimeSec + durSec) {
            return Math.max(0, (t - tr.sourceTimeSec) / durSec)
          }
        }
      }
    }
    return 1
  }, [globalTime, transitionPreview])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Video area with transition fade overlay */}
      <div className="relative flex-1 overflow-hidden">
        {transitionOpacity < 1 && (
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-black"
            style={{ opacity: 1 - transitionOpacity }}
          />
        )}
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
            // Suppress pause events during cut-skip seek window
            if (Date.now() < suppressPauseUntilRef.current) {
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
      </div>
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
