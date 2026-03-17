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
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EllipsisVertical } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import type { ProjectData } from '../../../../types/project'

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
  const contextMenuTriggerRef = useRef<HTMLDivElement>(null)

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

  function handleOpenContextMenu(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()

    const trigger = contextMenuTriggerRef.current
    if (!trigger) return

    const rect = event.currentTarget.getBoundingClientRect()
    trigger.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.bottom - rect.height / 2,
      view: window,
    }))
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
          <div ref={contextMenuTriggerRef} className={view === 'tile' ? 'group relative' : 'group relative w-full'}>
            {view === 'tile' ? (
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full flex-col items-stretch gap-0 overflow-hidden rounded-lg border border-white/5 bg-[#1f1f1f] p-0 text-left text-inherit whitespace-normal hover:border-white/20 hover:bg-[#1f1f1f] focus-visible:ring-blue-500 focus-visible:ring-offset-0 disabled:opacity-60"
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
                <div className="flex flex-col gap-0.5 px-3 py-2.5 pr-12">
                  <p className="truncate text-sm font-medium text-white">{project.name}</p>
                  <p className="truncate text-[11px] text-white/40">{dateLabel}</p>
                </div>
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-3 rounded-lg border border-white/5 bg-[#1f1f1f] px-4 py-3 pr-12 text-left text-inherit whitespace-normal hover:border-white/20 hover:bg-[#1f1f1f] focus-visible:ring-blue-500 focus-visible:ring-offset-0 disabled:opacity-60"
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
              </Button>
            )}
            <div
              className={view === 'tile'
                ? 'pointer-events-none absolute right-0 bottom-0 flex h-14 w-16 items-end justify-end rounded-br-lg bg-gradient-to-l from-[#1f1f1f] via-[#1f1f1f] to-transparent pr-2 pb-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
                : 'pointer-events-none absolute top-0 right-0 flex h-full w-16 items-center justify-end rounded-r-lg bg-gradient-to-l from-[#1f1f1f] via-[#1f1f1f] to-transparent pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="pointer-events-auto text-white/65 hover:bg-white/10 hover:text-white focus-visible:ring-blue-500 focus-visible:ring-offset-0"
                aria-label={`Open actions for ${project.name}`}
                onClick={handleOpenContextMenu}
              >
                <EllipsisVertical />
              </Button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="border-white/5 bg-[#1f1f1f]">
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
