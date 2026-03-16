import React from 'react'
import type { ProjectData } from '../../../types/project'

interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
}

export function ProjectLibrary(_props: ProjectLibraryProps): React.ReactElement {
  return <div>Project Library</div>
}
