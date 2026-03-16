import React, { useState } from 'react'
import type { ProjectData } from '../../types/project'
import { ProjectLibrary } from '@/screens/ProjectLibrary'
import { Editor } from '@/screens/editor/Editor'
import { ProjectCreationWizard } from '@/screens/wizard/ProjectCreationWizard'

export function App(): React.ReactElement {
  const [project, setProject] = useState<ProjectData | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  function handleProjectCreated(created: ProjectData) {
    setWizardOpen(false)
    setProject(created)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* macOS traffic light clearance + window drag region.
          36px matches the hiddenInset inset on macOS.
          Any interactive element placed inside this region must set
          style={{ WebkitAppRegion: 'no-drag' }} to remain clickable. */}
      <div
        className="h-9 w-full shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* Screen content — fills remaining height */}
      <div className="flex flex-1 overflow-hidden">
        {project ? (
          <Editor project={project} onClose={() => setProject(null)} />
        ) : (
          <ProjectLibrary
            onOpen={setProject}
            onNew={() => setWizardOpen(true)}
          />
        )}
      </div>
      {wizardOpen && (
        <ProjectCreationWizard
          onComplete={handleProjectCreated}
          onCancel={() => setWizardOpen(false)}
        />
      )}
    </div>
  )
}
