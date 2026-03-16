import React, { useRef } from 'react'

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
    if (paths && paths.length > 0) {
      onChange(paths)
    }
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
    const files = Array.from(e.dataTransfer.files)
    const paths = files.map((f) => (f as File & { path?: string }).path ?? f.name)
    if (paths.length > 0) {
      onChange(paths)
    }
  }

  const hasFiles = videoPaths.length > 0

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
        {hasFiles ? (
          <div className="w-full space-y-1">
            {videoPaths.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-foreground hover:bg-accent"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M7 4v16M17 4v16M2 9h5M17 9h5M2 14h5M17 14h5" />
                </svg>
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16v2a2 2 0 002 2h14a2 2 0 002-2v-2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0-12L8 8m4-4l4 4" />
            </svg>
            <p className="text-sm text-muted-foreground">Drop files here or</p>
            <button
              type="button"
              onClick={handleBrowse}
              className="rounded border border-border px-4 py-1.5 text-sm text-foreground hover:bg-accent"
            >
              Browse files...
            </button>
          </>
        )}
      </div>
    </div>
  )
}
