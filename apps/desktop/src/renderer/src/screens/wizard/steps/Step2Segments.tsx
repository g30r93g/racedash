import React from 'react'
import type { SegmentConfig } from '../../../../../types/project'

interface Step2SegmentsProps {
  videoPaths: string[]
  segments: SegmentConfig[]
  onChange: (segments: SegmentConfig[]) => void
}

export function Step2Segments(_props: Step2SegmentsProps) {
  return <div className="text-sm text-muted-foreground">Step 2 — Segments (stub)</div>
}
