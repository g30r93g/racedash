import React, { useState } from 'react'
import { WizardShell } from '@/components/wizard/WizardShell'
import { NewProjectStep } from './steps/NewProjectStep'
import { SegmentSetupStep } from './steps/SegmentSetupStep'
import { ReviewTimingStep } from './steps/ReviewTimingStep'
import type { ProjectData, SegmentConfig } from '../../../../types/project'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const STEPS = ['New Project', 'Segments', 'Review'] as const

interface NewProjectWizardProps {
  onComplete: (project: ProjectData) => void
  onCancel: () => void
}

interface WizardState {
  projectName: string
  videoPaths: string[]
  saveDir: string
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
}


export function NewProjectWizard({ onComplete, onCancel }: NewProjectWizardProps): React.ReactElement {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>({
    projectName: '',
    videoPaths: [],
    saveDir: '',
    segments: [],
    selectedDrivers: {},
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [segmentFormActive, setSegmentFormActive] = useState(false)

  const hasData = state.projectName.trim() !== '' || state.videoPaths.length > 0 || state.segments.length > 0

  const canContinue =
    (step === 0 && state.projectName.trim() !== '' && state.videoPaths.length > 0) ||
    (step === 1 && state.segments.length > 0) ||
    step === 2

  function handleCancel() {
    if (hasData) {
      setShowCancelDialog(true)
    } else {
      onCancel()
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const project = await window.racedash.createProject({
        name: state.projectName,
        videoPaths: state.videoPaths,
        segments: state.segments,
        selectedDrivers: state.selectedDrivers,
        ...(state.saveDir ? { saveDir: state.saveDir } : {}),
      })
      onComplete(project)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <WizardShell
        steps={STEPS}
        currentStep={step}
        canContinue={canContinue}
        onNext={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
        onBack={() => setStep((s) => Math.max(s - 1, 0))}
        onCancel={handleCancel}
        onSubmit={step === STEPS.length - 1 ? handleSubmit : undefined}
        submitLabel="Create Project"
        isSubmitting={isSubmitting}
        hideButtonBar={segmentFormActive}
        title=""
      >
        {step === 0 && (
          <NewProjectStep
            projectName={state.projectName}
            onProjectNameChange={(name) => setState((s) => ({ ...s, projectName: name }))}
            videoPaths={state.videoPaths}
            onVideoPathsChange={(paths) => setState((s) => ({ ...s, videoPaths: paths }))}
            saveDir={state.saveDir}
            onSaveDirChange={(dir) => setState((s) => ({ ...s, saveDir: dir }))}
          />
        )}
        {step === 1 && (
          <SegmentSetupStep
            videoPaths={state.videoPaths}
            segments={state.segments}
            selectedDrivers={state.selectedDrivers}
            onSegmentsChange={(segments) => setState((s) => ({ ...s, segments }))}
            onSelectedDriversChange={(drivers) => setState((s) => ({ ...s, selectedDrivers: drivers }))}
            onFormActiveChange={setSegmentFormActive}
          />
        )}
        {step === 2 && (
          <>
            <ReviewTimingStep segments={state.segments} selectedDrivers={state.selectedDrivers} videoPaths={state.videoPaths} />
            {submitError && (
              <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <p className="font-medium">Failed to create project</p>
                <p className="mt-1 font-mono text-xs opacity-80">{submitError}</p>
              </div>
            )}
          </>
        )}
      </WizardShell>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard project?</AlertDialogTitle>
            <AlertDialogDescription>You&apos;ll lose all progress on this project.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
