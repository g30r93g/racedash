import React, { useEffect, useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import type { VideoInfo } from '../../../../types/ipc'
import { VideoPane } from './VideoPane'
import { Timeline } from '@/components/app/Timeline'
import { EditorTabsPane } from './EditorTabsPane'

interface EditorProps {
  project: ProjectData
  onClose: () => void
}

export function Editor({ project, onClose: _onClose }: EditorProps): React.ReactElement {
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)

  useEffect(() => {
    if (project.videoPaths.length === 0) return
    window.racedash
      .getVideoInfo(project.videoPaths[0])
      .then(setVideoInfo)
      .catch((err: unknown) => {
        // Non-fatal: timeline renders with fallback duration.
        console.warn('[Editor] getVideoInfo failed:', err)
      })
  }, [project.videoPaths])

  return (
    <div className="grid h-full w-full grid-cols-[1fr_430px] overflow-hidden">
      {/* Left pane — video fills remaining height, timeline pinned to bottom */}
      <div className="grid min-w-0 grid-rows-[1fr_auto] overflow-hidden border-r border-border">
        <VideoPane videoPath={project.videoPaths[0]} />
        <Timeline project={project} videoInfo={videoInfo} />
      </div>

      {/* Right pane — tabbed panel */}
      <div className="flex min-w-0 flex-col overflow-hidden bg-card">
        <EditorTabsPane project={project} videoInfo={videoInfo} />
      </div>
    </div>
  )
}
