import React from 'react'
import type { ProjectData } from '../../../../types/project'

interface EditorProps {
  project: ProjectData
  onClose: () => void
}

export function Editor(_props: EditorProps): React.ReactElement {
  return <div>Editor</div>
}
