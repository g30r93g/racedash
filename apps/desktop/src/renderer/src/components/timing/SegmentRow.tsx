import React from 'react'
import type { SegmentConfig } from '../../../../types/project'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown } from 'lucide-react'

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
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(index)}
        className="hover:text-destructive"
        aria-label={`Delete ${segment.label}`}
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )
}
