import { WizardShell } from '@/components/wizard/WizardShell'
import { useState } from 'react'
import type { ProjectData, SegmentConfig } from '../../../../types/project'
import { SegmentSetupStep } from './steps/SegmentSetupStep'
import { ReviewTimingStep } from './steps/ReviewTimingStep'

interface EditWizardState {
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
}

interface ProjectEditWizardProps {
  project: ProjectData
  onSave: (updated: ProjectData) => void
  onCancel: () => void
}

const STEP_LABELS = ['Segments', 'Review'] as const

export function ProjectEditWizard({ project, onSave, onCancel }: ProjectEditWizardProps) {
  const [step, setStep] = useState(0)
  const [segmentFormActive, setSegmentFormActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [state, setState] = useState<EditWizardState>({
    segments: project.segments,
    selectedDrivers: project.selectedDrivers,
  })

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await window.racedash.updateProject(project.projectPath, state.segments, state.selectedDrivers)
      onSave(updated)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save project')
      setSaving(false)
    }
  }

  const canContinue =
    (step === 0 && state.segments.length >= 1) ||
    step >= 1

  return (
    <WizardShell
      title="Edit Project"
      steps={STEP_LABELS}
      currentStep={step}
      onNext={() => setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1))}
      onBack={() => setStep((s) => Math.max(s - 1, 0))}
      onCancel={onCancel}
      canContinue={canContinue}
      hideButtonBar={segmentFormActive}
      isSubmitting={saving}
      submitLabel="Save"
      onSubmit={step === STEP_LABELS.length - 1 ? handleSave : undefined}
    >
      {step === 0 && (
        <SegmentSetupStep
          videoPaths={project.videoPaths}
          segments={state.segments}
          selectedDrivers={state.selectedDrivers}
          onSegmentsChange={(segments) => setState((s) => ({ ...s, segments }))}
          onSelectedDriversChange={(drivers) => setState((s) => ({ ...s, selectedDrivers: drivers }))}
          onFormActiveChange={setSegmentFormActive}
        />
      )}
      {step === 1 && (
        <>
          <ReviewTimingStep
            segments={state.segments}
            selectedDrivers={state.selectedDrivers}
            videoPaths={project.videoPaths}
          />
          {saveError && <p className="mt-4 text-sm text-destructive">{saveError}</p>}
        </>
      )}
    </WizardShell>
  )
}
