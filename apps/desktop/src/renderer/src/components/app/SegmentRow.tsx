import React from 'react'
import type { SegmentConfig } from '../../../../types/project'
import { Button } from '@/components/ui/button'

const SOURCE_COLORS: Record<string, string> = {
  alphaTiming: '#3b82f6',
  mylapsSpeedhive: '#22c55e',
  daytonaEmail: '#f59e0b',
  teamsportEmail: '#ec4899',
  manual: '#6b7280',
}

interface SegmentRowProps {
  segment: SegmentConfig
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}

export function SegmentRow({ segment, index, onEdit, onDelete }: SegmentRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div
        className="h-full w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: SOURCE_COLORS[segment.source] ?? '#6b7280' }}
        aria-hidden="true"
      />
      <div className="flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium text-foreground">{segment.label}</p>
        <p className="text-xs text-muted-foreground">
          {segment.source}
          {segment.videoOffsetFrame !== undefined ? ` · Frame ${segment.videoOffsetFrame}` : ''}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onEdit(index)}
        aria-label={`Edit ${segment.label}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.213l-4 1 1-4L16.862 3.487z" />
        </svg>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(index)}
        className="hover:text-destructive"
        aria-label={`Delete ${segment.label}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </Button>
    </div>
  )
}
