import React, { useCallback, useRef, useState } from 'react'
import { VideoPlayer } from '@/components/app/VideoPlayer'
import { VideoPlaybackControls } from '@/components/app/VideoPlaybackControls'

interface VideoPaneProps {
  videoPath?: string
  onTimeUpdate?: (currentTime: number) => void
}

export function VideoPane({ videoPath, onTimeUpdate }: VideoPaneProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const handleTimeUpdate = useCallback((t: number) => {
    setCurrentTime(t)
    onTimeUpdate?.(t)
  }, [onTimeUpdate])

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
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={setDuration}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <VideoPlaybackControls
        duration={duration}
        currentTime={currentTime}
        playing={playing}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeek}
      />
    </div>
  )
}
