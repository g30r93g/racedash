import { InfoRow } from '@/components/shared/InfoRow'
import { SpinnerOverlay } from '@/components/loaders/Spinner'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEffect, useState } from 'react'
import type { ProjectData } from '../../../../../types/project'
import type { WizardState } from '../ProjectCreationWizard'

interface Step5ConfirmProps {
  state: WizardState
  onNameChange: (name: string) => void
  onSaveDirChange: (saveDir: string) => void
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

export function Step5Confirm({ state, onNameChange, onSaveDirChange, onComplete }: Step5ConfirmProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!state.projectName) onNameChange(suggestProjectName(state.videoPaths))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleChooseDirectory() {
    const chosen = await window.racedash.openDirectory({ title: 'Choose save location' })
    if (chosen) onSaveDirChange(chosen)
  }

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
        selectedDrivers: state.selectedDrivers,
        saveDir: state.saveDir,
      })
      onComplete(project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setLoading(false)
    }
  }

  const saveDirectory = state.saveDir ?? `~/Videos/racedash/${slugify(state.projectName || 'project')}/`

  return (
    <SpinnerOverlay
      active={loading}
      name="checkerboard"
      size="1.5rem"
      color="#3b82f6"
      speed={2.5}
      ignoreReducedMotion
      label="Creating project…"
      containerClassName="flex flex-col gap-5"
    >
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
        <InfoRow
          label="Videos"
          value={`${state.videoPaths.length} file${state.videoPaths.length !== 1 ? 's' : ''} selected`}
        />
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-muted-foreground">Save to</span>
          <div className="flex items-center gap-2">
            <span className="max-w-60 truncate text-right text-xs text-foreground" title={saveDirectory}>
              {saveDirectory}
            </span>
            <Button
              type="button"
              variant="link"
              onClick={handleChooseDirectory}
              disabled={loading}
              className="h-auto p-0 text-xs text-primary"
            >
              Change
            </Button>
          </div>
        </div>

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
                <InfoRow label="Source" value={seg.source} />
                <InfoRow label="Driver" value={state.selectedDrivers[seg.label] || '—'} />
                {seg.url && <InfoRow label="URL" value={seg.url} />}
                {seg.emailPath && (
                  <InfoRow label="File" value={seg.emailPath.split('/').pop() ?? seg.emailPath} />
                )}
                <InfoRow
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
        className="self-end"
      >
        {loading ? 'Saving project...' : 'Create Project'}
      </Button>
    </SpinnerOverlay>
  )
}
