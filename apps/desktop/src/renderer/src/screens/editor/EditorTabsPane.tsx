import React from 'react'
import type { ProjectData } from '../../../../types/project'

interface EditorTabsPaneProps {
  project: ProjectData
}

export function EditorTabsPane({ project: _project }: EditorTabsPaneProps): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-xs text-muted-foreground">Editor Tabs — coming soon</p>
    </div>
  )
}
