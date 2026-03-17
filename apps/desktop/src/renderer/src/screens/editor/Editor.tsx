import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import type { TimestampsResult, VideoInfo } from '../../../../types/ipc'
import { VideoPane, type VideoPaneHandle } from './VideoPane'
import { Timeline } from '@/components/app/Timeline'
import { EditorTabsPane } from './EditorTabsPane'

interface EditorProps {
  project: ProjectData
  onClose: () => void
}

export function Editor({ project, onClose }: EditorProps): React.ReactElement {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [timestampsResult, setTimestampsResult] = useState<TimestampsResult | null>(null)

  useEffect(() => {
    if (project.videoPaths.length === 0) return
    window.racedash
      .getVideoInfo(project.videoPaths[0])
      .then(setVideoInfo)
      .catch((err: unknown) => {
        console.warn('[Editor] getVideoInfo failed:', err)
      })
  }, [project.videoPaths])

  useEffect(() => {
    if (videoInfo === null) return
    window.racedash
      .generateTimestamps({ configPath: project.configPath, fps: videoInfo.fps })
      .then(setTimestampsResult)
      .catch((err: unknown) => {
        console.warn('[Editor] generateTimestamps failed:', err)
      })
  }, [project.configPath, videoInfo])

  const videoPaneRef = useRef<VideoPaneHandle>(null)
  const handleTimeUpdate = useCallback((t: number) => setCurrentTime(t), [])
  const handleSeek = useCallback((t: number) => videoPaneRef.current?.seek(t), [])
  const handleSave = useCallback(() => {
    videoPaneRef.current?.pause()
    onClose()
  }, [onClose])

  return (
    <div className="grid h-full w-full grid-cols-[1fr_430px] overflow-hidden">
      {/* Left pane — video fills remaining height, timeline pinned to bottom */}
      <div className="grid min-w-0 grid-rows-[1fr_auto] overflow-hidden border-r border-border">
        <VideoPane ref={videoPaneRef} videoPath={project.videoPaths[0]} fps={videoInfo?.fps} onTimeUpdate={handleTimeUpdate} />
        <Timeline
          project={project}
          videoInfo={videoInfo}
          currentTime={currentTime}
          timestampsResult={timestampsResult}
          onSeek={handleSeek}
        />
      </div>

      {/* Right pane — tabbed panel */}
      <div className="flex min-w-0 flex-col overflow-hidden bg-card">
        <EditorTabsPane project={project} videoInfo={videoInfo} currentTime={currentTime} onSave={handleSave} />
      </div>
    </div>
  )
}
