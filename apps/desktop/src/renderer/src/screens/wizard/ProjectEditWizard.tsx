import { StepIndicator } from '@/components/layout/StepIndicator'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useState } from 'react'
import type { ProjectData, SegmentConfig } from '../../../../types/project'
import { Step2Segments } from './steps/Step2Segments'
import { Step3Driver } from './steps/Step3Driver'
import { Step4Verify } from './steps/Step4Verify'

interface EditWizardState {
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
}

interface ProjectEditWizardProps {
  project: ProjectData
  onSave: (updated: ProjectData) => void
  onCancel: () => void
}

const STEP_LABELS = ['Segments', 'Driver', 'Verify'] as const

export function ProjectEditWizard({ project, onSave, onCancel }: ProjectEditWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [segmentSubForm, setSegmentSubForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [state, setState] = useState<EditWizardState>({
    segments: project.segments,
    selectedDrivers: project.selectedDrivers,
  })

  function updateState(patch: Partial<EditWizardState>) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, 3) as 1 | 2 | 3)
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await window.racedash.updateProject(
        project.projectPath,
        state.segments,
        state.selectedDrivers,
      )
      onSave(updated)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save project')
      setSaving(false)
    }
  }

  const canContinue =
    (step === 1 && state.segments.length >= 1) ||
    (step === 2 && state.segments.every((seg) => !!state.selectedDrivers[seg.label])) ||
    step >= 3

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent
        className="flex w-172.5 flex-col gap-0 p-0"
        onInteractOutside={(event) => event.preventDefault()}
        style={{ minHeight: '630px', maxHeight: '90vh' }}
      >
        <div className="shrink-0 border-b border-border px-8 py-6">
          <StepIndicator currentStep={step} steps={STEP_LABELS} />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {step === 1 && (
            <Step2Segments
              videoPaths={project.videoPaths}
              joinedVideoPath={project.videoPaths[0]}
              segments={state.segments}
              onChange={(segments) => updateState({ segments })}
              onSubFormChange={setSegmentSubForm}
            />
          )}
          {step === 2 && (
            <Step3Driver
              segments={state.segments}
              selectedDrivers={state.selectedDrivers}
              onChange={(drivers) => updateState({ selectedDrivers: drivers })}
            />
          )}
          {step === 3 && (
            <>
              <Step4Verify segments={state.segments} selectedDrivers={state.selectedDrivers} />
              {saveError && (
                <p className="mt-4 text-sm text-destructive">{saveError}</p>
              )}
            </>
          )}
        </div>

        <div className={`flex shrink-0 items-center justify-between border-t border-border px-8 py-4${segmentSubForm ? ' hidden' : ''}`}>
          <Button variant="ghost" onClick={step === 1 ? onCancel : goBack}>
            {step === 1 ? 'Cancel' : '← Back'}
          </Button>
          {step < 3 && (
            <Button onClick={goNext} disabled={!canContinue}>
              Continue
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
