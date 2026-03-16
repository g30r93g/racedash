import React from 'react'

interface Step1VideosProps {
  videoPaths: string[]
  onChange: (paths: string[]) => void
}

export function Step1Videos(_props: Step1VideosProps) {
  return <div className="text-sm text-muted-foreground">Step 1 — Videos (stub)</div>
}
