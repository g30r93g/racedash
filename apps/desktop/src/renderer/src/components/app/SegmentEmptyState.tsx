import React from 'react'

export function SegmentEmptyState() {
  return (
    <div className="flex min-h-35 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border">
      <p className="text-sm text-muted-foreground">No segments yet. Add at least one to continue.</p>
    </div>
  )
}
