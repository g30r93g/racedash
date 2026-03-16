import React, { useState } from 'react'
import type { SegmentConfig } from '../../../../../types/project'
import { Step2AddSegmentForm } from './Step2AddSegmentForm'

interface Step2SegmentsProps {
  videoPaths: string[]
  segments: SegmentConfig[]
  onChange: (segments: SegmentConfig[]) => void
}

type FormMode = { mode: 'add' } | { mode: 'edit'; index: number }

const SOURCE_COLORS: Record<string, string> = {
  alphaTiming: '#3b82f6',
  mylapsSpeedhive: '#22c55e',
  daytonaEmail: '#f59e0b',
  teamsportEmail: '#ec4899',
  manual: '#6b7280',
}

export function Step2Segments({ videoPaths, segments, onChange }: Step2SegmentsProps) {
  const [formMode, setFormMode] = useState<FormMode | null>(null)

  function handleSave(segment: SegmentConfig) {
    if (!formMode) return
    if (formMode.mode === 'add') {
      onChange([...segments, segment])
    } else {
      const updated = segments.map((s, i) => (i === formMode.index ? segment : s))
      onChange(updated)
    }
    setFormMode(null)
  }

  function handleDelete(index: number) {
    onChange(segments.filter((_, i) => i !== index))
  }

  if (formMode !== null) {
    const existing = formMode.mode === 'edit' ? segments[formMode.index] : undefined
    return (
      <Step2AddSegmentForm
        videoPaths={videoPaths}
        initial={existing}
        mode={formMode.mode}
        onSave={handleSave}
        onBack={() => setFormMode(null)}
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
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border">
            <span className="text-2xl text-muted-foreground" aria-hidden="true">+</span>
            <p className="text-sm text-muted-foreground">
              No segments yet. Add at least one to continue.
            </p>
          </div>
        ) : (
          <>
            {segments.map((seg, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div
                  className="h-full w-1 shrink-0 self-stretch rounded-full"
                  style={{ backgroundColor: SOURCE_COLORS[seg.source] ?? '#6b7280' }}
                  aria-hidden="true"
                />
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-sm font-medium text-foreground">{seg.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {seg.source}
                    {seg.videoOffsetFrame !== undefined
                      ? ` · Frame ${seg.videoOffsetFrame}`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormMode({ mode: 'edit', index })}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={`Edit ${seg.label}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.25 2.25 0 113.182 3.182L7.5 19.213l-4 1 1-4L16.862 3.487z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(index)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${seg.label}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setFormMode({ mode: 'add' })}
              className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              <span aria-hidden="true">+</span>
              <span>Add another segment</span>
            </button>
          </>
        )}
      </div>

      {segments.length === 0 && (
        <button
          type="button"
          onClick={() => setFormMode({ mode: 'add' })}
          className="self-start rounded bg-primary px-5 py-2 text-sm font-medium text-primary-foreground"
        >
          + Add segment
        </button>
      )}
    </div>
  )
}
