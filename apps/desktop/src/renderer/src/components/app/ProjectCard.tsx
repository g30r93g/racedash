import React, { useEffect, useRef, useState } from 'react'
import type { ProjectData } from '../../../../types/project'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface ProjectCardProps {
  project: ProjectData
  view?: 'tile' | 'list'
  onOpen: (project: ProjectData) => void
  onDelete: (project: ProjectData) => void
  onRename: (updated: ProjectData) => void
}

export function ProjectCard({ project, view = 'tile', onOpen, onDelete, onRename }: ProjectCardProps): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(project.name)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renameOpen) {
      setRenameValue(project.name)
      setTimeout(() => renameInputRef.current?.select(), 0)
    }
  }, [renameOpen, project.name])

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

  async function handleConfirmRename(): Promise<void> {
    if (!renameValue.trim() || renameValue.trim() === project.name) {
      setRenameOpen(false)
      return
    }
    try {
      const updated = await window.racedash.renameProject(project.projectPath, renameValue.trim())
      onRename(updated)
      setRenameOpen(false)
    } catch (err) {
      console.error('[racedash] failed to rename project', err)
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    try {
      await window.racedash.deleteProject(project.projectPath)
      onDelete(project)
    } catch (err) {
      console.error('[racedash] failed to delete project', err)
    }
  }

  const dateLabel = `Opened ${new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`

  const playIcon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.5 3.5L12.5 8L5.5 12.5V3.5Z" fill="white" fillOpacity="0.7" />
    </svg>
  )

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {view === 'tile' ? (
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
                    {playIcon}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-0.5 px-3 py-2.5">
                <p className="truncate text-sm font-medium text-white">{project.name}</p>
                <p className="truncate text-[11px] text-white/40">{dateLabel}</p>
              </div>
            </button>
          ) : (
            <button
              className="group flex w-full items-center gap-3 rounded-lg border border-white/5 bg-[#1f1f1f] px-4 py-3 text-left transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
              onClick={handleClick}
              disabled={loading}
            >
              {loading ? (
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/15">
                  {playIcon}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm font-medium text-white">{project.name}</p>
                <p className="truncate text-[11px] text-white/40">{dateLabel}</p>
              </div>
            </button>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setRenameOpen(true)}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            Delete project
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename() }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmRename} disabled={!renameValue.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{project.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project and all its files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
