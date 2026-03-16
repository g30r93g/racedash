import React, { useEffect, useState } from 'react'
import type { ProjectData } from '../../../types/project'
import { AppSidebar } from '@/components/app/AppSidebar'
import type { LibraryTab } from '@/components/app/AppSidebar'
import { ProjectCard } from '@/components/app/ProjectCard'
import { CloudRendersList } from '@/components/app/CloudRendersList'
import { AccountDetails } from '@/components/app/AccountDetails'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'

interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
  onNew: () => void
}

export function ProjectLibrary({ onOpen, onNew }: ProjectLibraryProps): React.ReactElement {
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<LibraryTab>('projects')

  useEffect(() => {
    window.racedash
      .listProjects()
      .then((result) => setProjects(result))
      .catch((err) => console.error('[racedash] failed to list projects', err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-full max-h-[650px] w-full max-w-[1050px] overflow-hidden rounded-xl bg-[#1c1c1c] p-4 shadow-2xl">
      <AppSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        cloudRenderCount={0}
        user={{ name: 'G. Gorzynski', email: 'george@university.ac.uk', plan: 'pro' }}
      />

      <div className="flex flex-1 flex-col overflow-hidden p-4">
            {activeTab === 'projects' && (
              <>
                <div className="mb-6 flex shrink-0 items-center justify-between">
                  <h1 className="text-lg font-semibold text-white">Projects</h1>
                  <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-500">
                    + New RaceDash Project
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  {loading ? (
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[158px] rounded-lg" />
                      ))}
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                      <p className="text-sm text-white/40">No projects yet. Create your first project.</p>
                      <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-500">
                        + New RaceDash Project
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4">
                      {projects.map((project) => (
                        <ProjectCard key={project.projectPath} project={project} onOpen={onOpen} />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}

            {activeTab === 'cloud-renders' && (
              <>
                <div className="mb-6 flex shrink-0 items-center">
                  <h1 className="text-lg font-semibold text-white">Cloud Renders</h1>
                </div>
                <CloudRendersList />
              </>
            )}

            {activeTab === 'account' && (
              <>
                <div className="mb-6 flex shrink-0 items-center">
                  <h1 className="text-lg font-semibold text-white">Account</h1>
                </div>
                <AccountDetails />
              </>
            )}
      </div>
    </div>
  )
}
