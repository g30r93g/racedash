import React, { useEffect, useState } from 'react'
import type { ProjectData } from '../../../types/project'

interface ProjectLibraryProps {
  onOpen: (project: ProjectData) => void
  onNew: () => void
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ onNew }: { onNew: () => void }): React.ReactElement {
  return (
    <div className="flex w-[190px] shrink-0 flex-col bg-[#161616] px-3 py-4">
      {/* Logo */}
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2.5 7L5.5 10L11.5 4"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="text-sm font-bold text-white">Racedash</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {/* Projects — active */}
        <button
          className="flex w-full items-center gap-2.5 rounded-md bg-white/10 px-2.5 py-2 text-left text-sm font-medium text-white"
          disabled
        >
          <FolderIcon />
          Projects
        </button>

        {/* Cloud Renders — disabled stub */}
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-white/40"
          disabled
          title="Coming soon"
        >
          <CloudIcon />
          <span className="flex-1">Cloud Renders</span>
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/30">
            0
          </span>
        </button>

        {/* Account — disabled stub */}
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-white/40"
          disabled
          title="Coming soon"
        >
          <AccountIcon />
          Account
        </button>
      </nav>

      {/* User profile — static placeholder */}
      <div className="mt-4 flex items-center gap-2.5 rounded-md px-2.5 py-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-[11px] font-bold text-white">
          GG
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">G. Gorzynski</p>
          <p className="truncate text-[10px] text-blue-400">Racedash Cloud PRO</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: ProjectData
  onOpen: (project: ProjectData) => void
}

function ProjectCard({ project, onOpen }: ProjectCardProps): React.ReactElement {
  const [loading, setLoading] = useState(false)

  async function handleClick(): Promise<void> {
    if (loading) return
    setLoading(true)
    try {
      const loaded = await window.racedash.openProject(project.projectPath)
      onOpen(loaded)
    } catch (err) {
      console.error('[racedash] failed to open project', err)
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
      {/* Thumbnail */}
      <div className="relative flex h-[110px] w-full items-center justify-center bg-[#141414]">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/15">
          {loading ? (
            <svg
              className="h-4 w-4 animate-spin text-white/50"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M5.5 3.5L12.5 8L5.5 12.5V3.5Z" fill="white" fillOpacity="0.7" />
            </svg>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <p className="truncate text-sm font-medium text-white">{project.name}</p>
        <p className="truncate text-[11px] text-white/40">{dateLabel}</p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onNew }: { onNew: () => void }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-white/40">No projects yet. Create your first project.</p>
      <button
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        onClick={onNew}
      >
        + New RaceDash Project
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[158px] animate-pulse rounded-lg bg-white/5"
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function ProjectLibrary({ onOpen, onNew }: ProjectLibraryProps): React.ReactElement {
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.racedash
      .listProjects()
      .then((result) => {
        setProjects(result)
      })
      .catch((err) => {
        console.error('[racedash] failed to list projects', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-[#0d0d0d]">
      <div className="flex h-[650px] w-[1050px] overflow-hidden rounded-xl bg-[#1c1c1c] shadow-2xl">
        <Sidebar onNew={onNew} />

        <div className="flex flex-1 flex-col overflow-hidden px-8 py-6">
          {/* Header row */}
          <div className="mb-6 flex shrink-0 items-center justify-between">
            <h1 className="text-lg font-semibold text-white">Projects</h1>
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              onClick={onNew}
            >
              + New RaceDash Project
            </button>
          </div>

          {/* Content area */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {loading ? (
              <LoadingSkeleton />
            ) : projects.length === 0 ? (
              <EmptyState onNew={onNew} />
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {projects.map((project) => (
                  <ProjectCard
                    key={project.projectPath}
                    project={project}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icon components (inline SVG)
// ---------------------------------------------------------------------------

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H5.879C6.144 2.5 6.398 2.605 6.586 2.793L7.207 3.414C7.395 3.602 7.649 3.707 7.914 3.707H12.5C13.052 3.707 13.5 4.155 13.5 4.707V11.5C13.5 12.052 13.052 12.5 12.5 12.5H2.5C1.948 12.5 1.5 12.052 1.5 11.5V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function CloudIcon(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M4.5 10.5C3.119 10.5 2 9.381 2 8C2 6.753 2.887 5.713 4.07 5.53C4.285 3.83 5.737 2.5 7.5 2.5C9.157 2.5 10.539 3.679 10.893 5.235C12.1 5.416 13 6.454 13 7.5C13 8.881 11.881 10.5 10.5 10.5H4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function AccountIcon(): React.ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M2 13C2 10.791 4.462 9 7.5 9C10.538 9 13 10.791 13 13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
