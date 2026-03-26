import { WizardShell } from '@/components/wizard/WizardShell'
import { useState } from 'react'
import type { ProjectData, SegmentConfig } from '../../../../types/project'
import { SegmentsStep } from './steps/SegmentsStep'
import { DriverStep } from './steps/DriverStep'
import { VerifyStep } from './steps/VerifyStep'

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
  const [step, setStep] = useState(0)
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
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1))
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

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
    (step === 1 && state.segments.every((seg) => !!state.selectedDrivers[seg.label])) ||
    step >= 2

  return (
    <WizardShell
      title="Edit Project"
      steps={STEP_LABELS}
      currentStep={step}
      onNext={goNext}
      onBack={goBack}
      onCancel={onCancel}
      canContinue={canContinue}
      hideButtonBar={segmentSubForm}
      isSubmitting={saving}
      submitLabel="Save"
      onSubmit={handleSave}
    >
      {step === 0 && (
        <SegmentsStep
          videoPaths={project.videoPaths}
          joinedVideoPath={project.videoPaths[0]}
          segments={state.segments}
          onChange={(segments) => updateState({ segments })}
          onSubFormChange={setSegmentSubForm}
        />
      )}
      {step === 1 && (
        <DriverStep
          segments={state.segments}
          selectedDrivers={state.selectedDrivers}
          onChange={(drivers) => updateState({ selectedDrivers: drivers })}
        />
      )}
      {step === 2 && (
        <>
          <VerifyStep segments={state.segments} selectedDrivers={state.selectedDrivers} />
          {saveError && <p className="mt-4 text-sm text-destructive">{saveError}</p>}
        </>
      )}
    </WizardShell>
  )
}
