import { ProjectLibrary } from '@/screens/project-library/ProjectLibrary'
import { Editor } from '@/screens/editor/Editor'
import { ProjectCreationWizard } from '@/screens/wizard/ProjectCreationWizard'
import { UpdateBanner } from '@/components/layout/UpdateBanner'
import { AuthModal } from '@/components/auth/AuthModal'
import { AuthModalContext } from '@/hooks/useAuth'
import React, { useState, useMemo } from 'react'
import type { ProjectData } from '../../types/project'
import { Play } from 'lucide-react'

export function App(): React.ReactElement {
  const [project, setProject] = useState<ProjectData | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const authModalValue = useMemo(() => ({ open: authModalOpen, setOpen: setAuthModalOpen }), [authModalOpen])

  function handleProjectCreated(created: ProjectData) {
    setWizardOpen(false)
    setProject(created)
  }

  return (
    <AuthModalContext.Provider value={authModalValue}>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* macOS traffic light clearance + window drag region.
          36px matches the hiddenInset inset on macOS.
          Any interactive element placed inside this region must set
          style={{ WebkitAppRegion: 'no-drag' }} to remain clickable. */}
        <div
          className="relative flex h-9 w-full shrink-0 items-center justify-center"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <UpdateBanner />
          <span className="text-xs font-medium text-white/40 select-none">RaceDash</span>
        </div>

        {/* Screen content — fills remaining height */}
        <div className="relative flex flex-1 overflow-hidden">
          {project ? (
            <Editor project={project} onClose={() => setProject(null)} />
          ) : (
            <>
              {/* Editor skeleton visible behind the library overlay */}
              <EditorSkeleton />
              {/* Project library floats over the skeleton */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm">
                <ProjectLibrary onOpen={setProject} onNew={() => setWizardOpen(true)} />
              </div>
            </>
          )}
        </div>
        {wizardOpen && (
          <ProjectCreationWizard onComplete={handleProjectCreated} onCancel={() => setWizardOpen(false)} />
        )}
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </div>
    </AuthModalContext.Provider>
  )
}

function EditorSkeleton(): React.ReactElement {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left pane — video + timeline */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        <div className="flex flex-1 items-center justify-center bg-[#0a0a0a]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <Play size={20} className="text-white/15" aria-hidden="true" />
          </div>
        </div>
        <div className="h-[140px] shrink-0 border-t border-border bg-[#111111]" />
      </div>
      {/* Right pane — tabs */}
      <div className="flex w-[430px] shrink-0 flex-col overflow-hidden bg-card" />
    </div>
  )
}
