import React, { useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Step1VideosProps {
  videoPaths: string[]
  onChange: (paths: string[]) => void
}

export function Step1Videos({ videoPaths, onChange }: Step1VideosProps) {
  const isDragging = useRef(false)

  async function handleBrowse() {
    const paths = await window.racedash.openFiles({
      filters: [{ name: 'Video files', extensions: ['mp4', 'mov', 'MP4', 'MOV'] }],
    })
    if (paths && paths.length > 0) onChange(paths)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    isDragging.current = true
  }

  function handleDragLeave() {
    isDragging.current = false
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    isDragging.current = false
    const paths = Array.from(e.dataTransfer.files).map(
      (f) => (f as File & { path?: string }).path ?? f.name
    )
    if (paths.length > 0) onChange(paths)
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Select your video files</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select your GoPro chapter files. If your recording spans multiple files, select them
          all — they'll be joined automatically.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-background p-6 transition-colors hover:border-primary/50"
      >
        {videoPaths.length > 0 ? (
          <div className="w-full space-y-1">
            {videoPaths.map((p) => (
              <div
                key={p}
                className="rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent"
              >
                <span className="truncate">{p.split('/').pop() ?? p}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={handleBrowse}
              className="mt-3 text-xs text-primary hover:underline"
            >
              Change files...
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Drop files here or</p>
            <Button variant="outline" size="sm" onClick={handleBrowse}>
              Browse files...
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
