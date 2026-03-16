import React, { useEffect, useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import type { VideoInfo } from '../../../../types/ipc'
import { VideoPane } from './VideoPane'
import { TimelinePane } from './TimelinePane'
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
    <div className="flex h-full overflow-hidden">
      {/* Left pane — video + timeline */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        <VideoPane />
        <TimelinePane project={project} videoInfo={videoInfo} />
      </div>

      {/* Right pane — tabbed panel */}
      <div className="flex w-[430px] shrink-0 flex-col overflow-hidden bg-card">
        <EditorTabsPane project={project} videoInfo={videoInfo} />
      </div>
    </div>
  )
}
