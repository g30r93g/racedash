import React, { useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import { Skeleton } from '@/components/ui/skeleton'

interface ProjectCardProps {
  project: ProjectData
  onOpen: (project: ProjectData) => void
}

export function ProjectCard({ project, onOpen }: ProjectCardProps): React.ReactElement {
  const [loading, setLoading] = useState(false)

  async function handleClick(): Promise<void> {
    if (loading) return
    setLoading(true)
    try {
      const loaded = await window.racedash.openProject(project.projectPath)
      onOpen(loaded)
    } catch (err) {
      console.error('[racedash] failed to open project', err)
    } finally {
      setLoading(false)
    }
  }

  const dateLabel = `Opened ${new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`

  return (
    <button
      className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-[#1f1f1f] text-left transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
      onClick={handleClick}
      disabled={loading}
    >
      <div className="relative flex h-[110px] w-full items-center justify-center bg-[#141414]">
        {loading ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/15">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5.5 3.5L12.5 8L5.5 12.5V3.5Z" fill="white" fillOpacity="0.7" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-white">{project.name}</p>
        <p className="truncate text-[11px] text-white/40">{dateLabel}</p>
      </div>
    </button>
  )
}
