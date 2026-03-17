import React, { useCallback, useEffect, useRef, useState } from 'react'
import { VideoPlayer } from '@/components/app/VideoPlayer'
import { VideoPlaybackControls } from '@/components/app/VideoPlaybackControls'

interface VideoPaneProps {
  videoPath?: string
  fps?: number
  onTimeUpdate?: (currentTime: number) => void
}

export function VideoPane({ videoPath, fps = 60, onTimeUpdate }: VideoPaneProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
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
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [playing, onTimeUpdate])

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
  }, [onTimeUpdate])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <VideoPlayer
        ref={videoRef}
        videoPath={videoPath}
        muted={muted}
        onLoadedMetadata={setDuration}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
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
