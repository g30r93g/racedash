import React, { useState } from 'react'
import type { SegmentConfig } from '../../../../../types/project'
import { SegmentForm } from '@/components/app/SegmentForm'
import { SegmentRow } from '@/components/app/SegmentRow'
import { SegmentEmptyState } from '@/components/app/SegmentEmptyState'
import { Button } from '@/components/ui/button'

interface Step2SegmentsProps {
  videoPaths: string[]
  segments: SegmentConfig[]
  onChange: (segments: SegmentConfig[]) => void
  onSubFormChange?: (active: boolean) => void
}

type FormMode = { mode: 'add' } | { mode: 'edit'; index: number }

export function Step2Segments({ videoPaths, segments, onChange, onSubFormChange }: Step2SegmentsProps) {
  const [formMode, setFormMode] = useState<FormMode | null>(null)

  function openForm(mode: FormMode) {
    setFormMode(mode)
    onSubFormChange?.(true)
  }

  function closeForm() {
    setFormMode(null)
    onSubFormChange?.(false)
  }

  function handleSave(segment: SegmentConfig) {
    if (!formMode) return
    onChange(
      formMode.mode === 'add'
        ? [...segments, segment]
        : segments.map((s, i) => (i === formMode.index ? segment : s))
    )
    closeForm()
  }

  if (formMode !== null) {
    return (
      <SegmentForm
        videoPaths={videoPaths}
        initial={formMode.mode === 'edit' ? segments[formMode.index] : undefined}
        mode={formMode.mode}
        onSave={handleSave}
        onBack={closeForm}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Define segments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A segment is a named session — e.g. Practice or Race. Each has its own timing source
          and a start position in your video.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {segments.length === 0 ? (
          <SegmentEmptyState />
        ) : (
          <>
            {segments.map((seg, index) => (
              <SegmentRow
                key={index}
                segment={seg}
                index={index}
                onEdit={(i) => openForm({ mode: 'edit', index: i })}
                onDelete={(i) => onChange(segments.filter((_, j) => j !== i))}
              />
            ))}
            <Button
              variant="outline"
              className="mt-2 w-full border-dashed"
              onClick={() => openForm({ mode: 'add' })}
            >
              + Add another segment
            </Button>
          </>
        )}
      </div>

      {segments.length === 0 && (
        <Button className="self-start" onClick={() => openForm({ mode: 'add' })}>
          + Add segment
        </Button>
      )}
    </div>
  )
}
