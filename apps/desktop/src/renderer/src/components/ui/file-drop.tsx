import * as React from 'react'
import { cn } from '@/lib/utils'

interface FileDropProps {
  value?: string
  placeholder: string
  hint?: string
  onClick: () => void
  className?: string
}

/**
 * A dashed drop-zone / click-to-browse area used for file inputs.
 * Handles keyboard activation so it's accessible.
 */
export function FileDrop({ value, placeholder, hint, onClick, className }: FileDropProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
      className={cn(
        'flex min-h-[80px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-4 hover:border-primary/50',
        className
      )}
    >
      {value ? (
        <p className="text-sm text-foreground">{value.split('/').pop()}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{placeholder}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </>
      )}
    </div>
  )
}
