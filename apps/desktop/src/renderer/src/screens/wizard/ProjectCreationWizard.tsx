import { WizardShell } from '@/components/wizard/WizardShell'
import { useState } from 'react'
import type { ProjectData, SegmentConfig } from '../../../../types/project'
import { VideosStep } from './steps/VideosStep'
import { SegmentsStep } from './steps/SegmentsStep'
import { DriverStep } from './steps/DriverStep'
import { VerifyStep } from './steps/VerifyStep'
import { ConfirmStep } from './steps/ConfirmStep'

export interface WizardState {
  videoPaths: string[]
  joinedVideoPath?: string
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
  projectName: string
  saveDir?: string
}

interface ProjectCreationWizardProps {
  onComplete: (project: ProjectData) => void
  onCancel: () => void
}

const STEP_LABELS = ['Videos', 'Segments', 'Driver', 'Verify', 'Confirm'] as const

export function ProjectCreationWizard({ onComplete, onCancel }: ProjectCreationWizardProps) {
  const [step, setStep] = useState(0)
  const [segmentSubForm, setSegmentSubForm] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [state, setState] = useState<WizardState>({
    videoPaths: [],
    segments: [],
    selectedDrivers: {},
    projectName: '',
  })

  function updateState(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1))
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  function handleVideoPathsChange(paths: string[]) {
    setState((prev) => ({ ...prev, videoPaths: paths, joinedVideoPath: undefined }))
    setJoinError(null)
  }

  async function handleContinue() {
    if (step === 0 && !state.joinedVideoPath) {
      setJoining(true)
      setJoinError(null)
      try {
        const { joinedPath } = await window.racedash.joinVideos(state.videoPaths)
        updateState({ joinedVideoPath: joinedPath })
        setJoining(false)
        goNext()
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Failed to join video files')
        setJoining(false)
      }
      return
    }
    goNext()
  }

  const canContinue =
    (step === 0 && state.videoPaths.length >= 1) ||
    (step === 1 && state.segments.length >= 1) ||
    (step === 2 && state.segments.every((seg) => !!state.selectedDrivers[seg.label])) ||
    step >= 3

  return (
    <WizardShell
      title="Create Project"
      steps={STEP_LABELS}
      currentStep={step}
      onNext={handleContinue}
      onBack={goBack}
      onCancel={onCancel}
      canContinue={canContinue}
      hideButtonBar={segmentSubForm}
      nextDisabled={joining}
      nextLabel={joining ? 'Joining\u2026' : 'Continue'}
    >
      {step === 0 && (
        <VideosStep
          videoPaths={state.videoPaths}
          onChange={handleVideoPathsChange}
          joining={joining}
          joinError={joinError ?? undefined}
        />
      )}
      {step === 1 && (
        <SegmentsStep
          videoPaths={state.videoPaths}
          joinedVideoPath={state.joinedVideoPath}
          segments={state.segments}
          onChange={(segments) => updateState({ segments })}
          onSubFormChange={setSegmentSubForm}
        />
      )}
      {step === 2 && (
        <DriverStep
          segments={state.segments}
          selectedDrivers={state.selectedDrivers}
          onChange={(drivers) => updateState({ selectedDrivers: drivers })}
        />
      )}
      {step === 3 && <VerifyStep segments={state.segments} selectedDrivers={state.selectedDrivers} />}
      {step === 4 && (
        <ConfirmStep
          state={state}
          onNameChange={(name) => updateState({ projectName: name })}
          onSaveDirChange={(saveDir) => updateState({ saveDir })}
          onComplete={onComplete}
        />
      )}
    </WizardShell>
  )
}
