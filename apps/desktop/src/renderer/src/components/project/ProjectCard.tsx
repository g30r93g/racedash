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
import { EllipsisVertical, Play } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import type { ProjectData } from '../../../../types/project'

interface ProjectCardProps {
  project: ProjectData
  view?: 'tile' | 'list'
  onOpen: (project: ProjectData) => void
  onDelete: (project: ProjectData) => void
  onRename: (updated: ProjectData) => void
  onLocate?: (oldProjectPath: string, updated: ProjectData) => void
}

export function ProjectCard({ project, view = 'tile', onOpen, onDelete, onRename, onLocate }: ProjectCardProps): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(project.name)
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const contextMenuTriggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (renameOpen) {
      setRenameValue(project.name)
      setTimeout(() => renameInputRef.current?.select(), 0)
    }
  }, [renameOpen, project.name])

  useEffect(() => {
    const videoPath = project.videoPaths[0]
    setPreviewImageSrc(null)

    if (!videoPath) return

    let cancelled = false
    const video = document.createElement('video')

    const cleanup = () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }

    const captureFrame = () => {
      if (cancelled || video.videoWidth === 0 || video.videoHeight === 0) return

      const scale = Math.min(1, 480 / video.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        cleanup()
        return
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      if (!cancelled) {
        setPreviewImageSrc(canvas.toDataURL('image/jpeg', 0.78))
      }
      cleanup()
    }

    const handleLoadedData = () => {
      captureFrame()
    }

    const handleError = () => {
      cleanup()
    }

    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = videoPath.startsWith('/') ? `media://${videoPath}` : videoPath
    video.addEventListener('loadeddata', handleLoadedData, { once: true })
    video.addEventListener('error', handleError, { once: true })

    return () => {
      cancelled = true
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('error', handleError)
      cleanup()
    }
  }, [project.videoPaths])

  const [locateError, setLocateError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  async function handleLocate(): Promise<void> {
    setLocateError(null)
    setLocating(true)
    try {
      const updated = await window.racedash.relocateProject(project.projectPath)
      onLocate?.(project.projectPath, updated)
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') {
        // no-op
      } else if (err instanceof Error && err.message === 'ALREADY_REGISTERED') {
        setLocateError('This project is already in your library')
      } else {
        setLocateError(err instanceof Error ? err.message : 'Failed to locate project')
      }
    } finally {
      setLocating(false)
    }
  }

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

  if (project.missing) {
    return (
      <>
        {view === 'tile' ? (
          <div className="flex h-auto w-full flex-col items-stretch gap-0 overflow-hidden rounded-lg border border-red-500 bg-[#1f1f1f]">
            <div className="relative flex h-[110px] w-full items-center justify-center bg-[#141414]">
              <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium uppercase tracking-wide text-red-400">
                Missing
              </span>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5">
              <p className="truncate text-sm font-medium text-white/60">{project.name}</p>
              {locateError && <p className="text-[11px] text-red-400">{locateError}</p>}
              <Button
                size="sm"
                variant="outline"
                className="mt-1 w-full border-red-500/40 text-red-400 hover:border-red-400 hover:text-red-300"
                onClick={handleLocate}
                disabled={locating}
              >
                {locating ? 'Locating…' : 'Locate…'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex h-auto w-full items-center gap-3 rounded-lg border border-red-500 bg-[#1f1f1f] px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <span className="text-[10px] font-bold text-red-400">!</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-sm font-medium text-white/60">{project.name}</p>
              <p className="text-[11px] text-red-400">Missing</p>
              {locateError && <p className="text-[11px] text-red-400">{locateError}</p>}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-red-500/40 text-red-400 hover:border-red-400 hover:text-red-300"
              onClick={handleLocate}
              disabled={locating}
            >
              {locating ? 'Locating…' : 'Locate…'}
            </Button>
          </div>
        )}
      </>
    )
  }

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
                  {previewImageSrc ? (
                    <>
                      <img
                        src={previewImageSrc}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover opacity-75"
                      />
                      <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
                    </>
                  ) : null}
                  {loading ? (
                    <Skeleton className="h-full w-full rounded-none" />
                  ) : (
                    <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 group-hover:bg-white/15">
                      <Play fill="white" />
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
                  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 group-hover:bg-white/15">
                    {previewImageSrc ? (
                      <>
                        <img
                          src={previewImageSrc}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover opacity-75"
                        />
                        <div className="absolute inset-0 bg-black/35" aria-hidden="true" />
                      </>
                    ) : null}
                    <Play className="relative z-10" fill="white" />
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
                ? 'pointer-events-none absolute right-0 bottom-0 flex h-14 w-16 items-end justify-end rounded-br-lg bg-linear-to-l from-[#1f1f1f] via-[#1f1f1f] to-transparent pr-2 pb-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'
                : 'pointer-events-none absolute top-0 right-0 flex h-full w-16 items-center justify-end rounded-r-lg bg-linear-to-l from-[#1f1f1f] via-[#1f1f1f] to-transparent pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'}
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
