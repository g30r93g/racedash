import React from 'react'

interface VideoEditingDrawerProps {
  children?: React.ReactNode
}

export function VideoEditingDrawer({ children }: VideoEditingDrawerProps): React.ReactElement {
  return (
    <div className="flex h-full w-64 flex-col overflow-y-auto border-r border-border bg-card p-3">
      <span className="mb-3 text-xs font-medium tracking-widest text-muted-foreground">VIDEO EDITING</span>
      {children}
    </div>
  )
}
