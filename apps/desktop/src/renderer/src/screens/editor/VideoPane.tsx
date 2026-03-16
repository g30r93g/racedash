import React from 'react'
import { VideoPlayer } from '@/components/app/VideoPlayer'
import { VideoPlaybackControls } from '@/components/app/VideoPlaybackControls'

interface VideoPaneProps {
  videoPath?: string
}

export function VideoPane({ videoPath }: VideoPaneProps): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col">
      <VideoPlayer videoPath={videoPath} />
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
