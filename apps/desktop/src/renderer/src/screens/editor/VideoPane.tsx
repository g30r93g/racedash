import React from 'react'
import { VideoPlayer } from '@/components/app/VideoPlayer'
import { VideoPlaybackControls } from '@/components/app/VideoPlaybackControls'

interface VideoPaneProps {
  videoPath?: string
  onTimeUpdate?: (currentTime: number) => void
}

export function VideoPane({ videoPath, onTimeUpdate }: VideoPaneProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <VideoPlayer videoPath={videoPath} onTimeUpdate={onTimeUpdate} />
      <VideoPlaybackControls
        duration={0}
        currentTime={0}
        playing={false}
        onPlay={() => {}}
        onPause={() => {}}
        onSeek={() => {}}
      />
    </div>
  )
}
