import React, { useEffect, useState } from 'react'
import type { WizardState } from '../ProjectCreationWizard'
import type { ProjectData } from '../../../../../types/project'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

interface Step5ConfirmProps {
  state: WizardState
  onNameChange: (name: string) => void
  onComplete: (project: ProjectData) => void
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function suggestProjectName(videoPaths: string[]): string {
  if (videoPaths.length === 0) return 'my-race-project'
  const filename = videoPaths[0].split('/').pop() ?? videoPaths[0]
  return filename.replace(/\.[^.]+$/, '').replace(/_?\d{4}$/, '')
}

export function Step5Confirm({ state, onNameChange, onComplete }: Step5ConfirmProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!state.projectName) onNameChange(suggestProjectName(state.videoPaths))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!state.projectName.trim()) return
    if (!state.joinedVideoPath) {
      setError('No joined video path — please go back to Step 1 and re-select your files.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const project = await window.racedash.createProject({
        name: state.projectName.trim(),
        joinedVideoPath: state.joinedVideoPath,
        segments: state.segments,
        selectedDriver: state.selectedDriver,
      })
      onComplete(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setLoading(false)
    }
  }

  const saveDirectory = `~/Videos/racedash/${slugify(state.projectName || 'project')}/`

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Confirm and create project</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your setup and confirm to save the project.
        </p>
      </div>

      <FormField label="Project name">
        <Input
          value={state.projectName}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={loading}
        />
      </FormField>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
        <SummaryRow
          label="Videos"
          value={`${state.videoPaths.length} file${state.videoPaths.length !== 1 ? 's' : ''} selected`}
        />
        <SummaryRow label="Save to" value={saveDirectory} mono />

        {state.segments.length > 0 && (
          <Tabs defaultValue={state.segments[0].label} className="mt-2">
            <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent px-0">
              {state.segments.map((seg) => (
                <TabsTrigger
                  key={seg.label}
                  value={seg.label}
                  className="-mb-px rounded-none border-b-2 border-transparent px-4 py-1.5 text-xs text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {seg.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {state.segments.map((seg) => (
              <TabsContent key={seg.label} value={seg.label} className="mt-3 space-y-1.5">
                <SummaryRow label="Source" value={seg.source} />
                <SummaryRow label="Driver" value={state.selectedDriver || '—'} />
                {seg.url && <SummaryRow label="URL" value={seg.url} mono />}
                {seg.emailPath && (
                  <SummaryRow label="File" value={seg.emailPath.split('/').pop() ?? seg.emailPath} />
                )}
                <SummaryRow
                  label="Offset"
                  value={seg.videoOffsetFrame !== undefined ? `Frame ${seg.videoOffsetFrame}` : 'Not set'}
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={handleCreate}
        disabled={loading || !state.projectName.trim()}
        className="self-start"
      >
        {loading ? 'Saving project...' : 'Create Project'}
      </Button>
    </div>
  )
}

function SummaryRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={`flex-1 text-sm text-foreground ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}
