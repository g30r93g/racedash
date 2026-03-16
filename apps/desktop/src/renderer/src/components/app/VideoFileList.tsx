import React from 'react'
import { Button } from '@/components/ui/button'

interface VideoFileListProps {
  paths: string[]
  onChange: (paths: string[]) => void
}

export function VideoFileList({ paths, onChange }: VideoFileListProps): React.ReactElement | null {
  if (paths.length === 0) return null

  function move(index: number, direction: -1 | 1) {
    const next = [...paths]
    const swap = index + direction
    ;[next[index], next[swap]] = [next[swap], next[index]]
    onChange(next)
  }

  function remove(index: number) {
    onChange(paths.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">{paths.length} file{paths.length !== 1 ? 's' : ''} selected</span>
        {paths.length > 1 && ' — files will be joined in this order'}
      </p>
      {paths.map((path, index) => {
        const name = path.split(/[\\/]/).pop() ?? path
        return (
          <div
            key={path}
            className="flex items-center gap-2 rounded-md border border-border bg-accent/40 px-3 py-2"
          >
            <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">
              {index + 1}
            </span>
            <span className="flex-1 truncate font-mono text-xs text-foreground">{name}</span>
            <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                onClick={() => move(index, 1)}
                disabled={index === paths.length - 1}
                aria-label="Move down"
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => remove(index)}
                aria-label="Remove"
              >
                ×
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
