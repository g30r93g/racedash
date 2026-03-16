import React from 'react'
import type { ProjectData } from '../../../../types/project'
import type { VideoInfo } from '../../../../types/ipc'
import { Timeline } from '@/components/app/Timeline'

interface TimelinePaneProps {
  project: ProjectData
  videoInfo: VideoInfo | null
}

export function TimelinePane({ project, videoInfo }: TimelinePaneProps): React.ReactElement {
  return <Timeline project={project} videoInfo={videoInfo} />
}
