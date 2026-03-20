import { AccountDetails } from '@/components/app/AccountDetails'
import type { LibraryTab } from '@/components/app/AppSidebar'
import { AppSidebar } from '@/components/app/AppSidebar'
import { CloudRendersList } from '@/components/app/CloudRendersList'
import { ProjectCard } from '@/components/app/ProjectCard'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SpinnerInline } from '@/components/loaders/Spinner'
import { LayoutGrid, Rows4 } from 'lucide-react'
import React, { useCallback, useEffect, useState } from 'react'
import type { ProjectData } from '../../../types/project'
import { useAuth } from '../hooks/useAuth'
import { useLicense } from '../hooks/useLicense'
import { useCredits } from '../hooks/useCredits'

type ProjectView = 'tile' | 'list'

interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
  onNew: () => void
}

export function ProjectLibrary({ onOpen, onNew }: ProjectLibraryProps): React.ReactElement {
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<LibraryTab>('projects')
  const [view, setView] = useState<ProjectView>('tile')

  const { user, license: authLicense, isSignedIn, signIn, signOut } = useAuth()
  const { license } = useLicense(isSignedIn)
  const { balance, fetchHistory } = useCredits(isSignedIn)

  // Determine display plan from license hook (preferred) or auth session fallback
  const displayPlan = license?.tier ?? authLicense?.tier ?? null

  useEffect(() => {
    window.racedash
      .listProjects()
      .then((result) => setProjects(result))
      .catch((err) => console.error('[racedash] failed to list projects', err))
      .finally(() => setLoading(false))
  }, [])

  const handleSubscribe = useCallback(async (tier: 'plus' | 'pro') => {
    try {
      await window.racedash.stripe.createSubscriptionCheckout({ tier })
    } catch {
      // User closed checkout or error
    }
  }, [])

  const handleTopUpCredits = useCallback(async () => {
    try {
      await window.racedash.stripe.createCreditCheckout({ packSize: 100 })
    } catch {
      // User closed checkout or error
    }
  }, [])

  const handleManageSubscription = useCallback(() => {
    // Stripe Customer Portal deferred to a future branch.
    // For now, open the Stripe billing page externally.
    // This is a no-op placeholder — the button text indicates it's an external link (↗).
  }, [])

  function handleLocate(oldProjectPath: string, updated: ProjectData) {
    setProjects((prev) => prev.map((p) => p.projectPath === oldProjectPath ? updated : p))
  }

  return (
    <div className="flex h-full max-h-[650px] w-full max-w-[1050px] overflow-hidden rounded-xl bg-[#1c1c1c] shadow-2xl">
      <AppSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        cloudRenderCount={0}
        user={user ? { name: user.name, email: user.email, plan: displayPlan } : undefined}
      />

      <div className="flex flex-1 flex-col overflow-hidden p-8">
            {activeTab === 'projects' && (
              <>
                <div className="mb-6 flex shrink-0 items-center justify-between">
                  <h1 className="text-lg font-semibold text-white">Projects</h1>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-md border border-white/10 p-0.5">
                      <button
                        onClick={() => setView('tile')}
                        className={`rounded p-1.5 transition-colors ${view === 'tile' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
                        aria-label="Tile view"
                      >
                        <LayoutGrid size={14} />
                      </button>
                      <button
                        onClick={() => setView('list')}
                        className={`rounded p-1.5 transition-colors ${view === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
                        aria-label="List view"
                      >
                        <Rows4 size={14} />
                      </button>
                    </div>
                    <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-500">
                      + New RaceDash Project
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  {loading ? (
                    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-3 text-white/50">
                      <SpinnerInline label="Project files are updating">
                        <span className="text-sm">Project files are updating</span>
                      </SpinnerInline>
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 text-center">
                      <p className="text-sm text-white/40">No projects yet. Create your first project.</p>
                      <Button onClick={onNew} className="bg-blue-600 hover:bg-blue-500">
                        + New RaceDash Project
                      </Button>
                    </div>
                  ) : (
                    <div className={view === 'tile' ? 'grid grid-cols-3 gap-4' : 'flex flex-col gap-2'}>
                      {projects.map((project) => (
                        <ProjectCard
                          key={project.projectPath}
                          project={project}
                          view={view}
                          onOpen={onOpen}
                          onDelete={(deleted) => setProjects((prev) => prev.filter((p) => p.projectPath !== deleted.projectPath))}
                          onRename={(updated) => setProjects((prev) => prev.map((p) => p.projectPath === updated.projectPath ? updated : p))}
                          onLocate={handleLocate}
                        />
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
                <CloudRendersList authUser={user ? { name: user.name } : null} />
              </>
            )}

            {activeTab === 'account' && (
              <>
                <div className="mb-6 flex shrink-0 items-center">
                  <h1 className="text-lg font-semibold text-white">Account</h1>
                </div>
                <AccountDetails
                  user={user}
                  license={authLicense}
                  creditBalance={balance}
                  onSignIn={signIn}
                  onSignOut={signOut}
                  onTopUpCredits={handleTopUpCredits}
                  onManageSubscription={handleManageSubscription}
                  onSubscribe={handleSubscribe}
                  fetchCreditHistory={fetchHistory}
                />
              </>
            )}
      </div>
    </div>
  )
}
