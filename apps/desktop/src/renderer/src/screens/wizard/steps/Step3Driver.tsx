import React from 'react'
import type { SegmentConfig } from '../../../../../types/project'

interface Step3DriverProps {
  segments: SegmentConfig[]
  selectedDriver: string
  onChange: (driver: string) => void
}

export function Step3Driver(_props: Step3DriverProps) {
  return <div className="text-sm text-muted-foreground">Step 3 — Driver (stub)</div>
}
