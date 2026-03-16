import React, { useState } from 'react'
import type { SegmentConfig, ProjectData } from '../../../../types/project'
import { WizardStepIndicator } from './WizardStepIndicator'
import { Step1Videos } from './steps/Step1Videos'
import { Step2Segments } from './steps/Step2Segments'
import { Step3Driver } from './steps/Step3Driver'
import { Step4Verify } from './steps/Step4Verify'
import { Step5Confirm } from './steps/Step5Confirm'
import { Button } from '@/components/ui/button'

export interface WizardState {
  videoPaths: string[]
  joinedVideoPath?: string
  segments: SegmentConfig[]
  selectedDriver: string
  projectName: string
}

interface ProjectCreationWizardProps {
  onComplete: (project: ProjectData) => void
  onCancel: () => void
}

const STEP_LABELS = ['Videos', 'Segments', 'Driver', 'Verify', 'Confirm'] as const

export function ProjectCreationWizard({ onComplete, onCancel }: ProjectCreationWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [state, setState] = useState<WizardState>({
    videoPaths: [],
    segments: [],
    selectedDriver: '',
    projectName: '',
  })

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  function updateState(patch: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function goNext() {
    setStep((s) => Math.min(s + 1, 5) as 1 | 2 | 3 | 4 | 5)
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4 | 5)
  }

  function handleVideoPathsChange(paths: string[]) {
    setState((prev) => ({ ...prev, videoPaths: paths, joinedVideoPath: undefined }))
    setJoinError(null)
  }

  async function handleContinue() {
    if (step === 1 && !state.joinedVideoPath) {
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
    (step === 1 && state.videoPaths.length >= 1) ||
    (step === 2 && state.segments.length >= 1) ||
    (step === 3 && state.selectedDriver !== '') ||
    step >= 4

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div
        className="flex w-[690px] flex-col rounded-lg border border-border bg-card shadow-2xl"
        style={{ minHeight: '630px', maxHeight: '90vh' }}
      >
        <div className="shrink-0 border-b border-border px-8 py-6">
          <WizardStepIndicator currentStep={step} steps={STEP_LABELS} />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {step === 1 && (
            <Step1Videos
              videoPaths={state.videoPaths}
              onChange={handleVideoPathsChange}
              joining={joining}
              joinError={joinError ?? undefined}
            />
          )}
          {step === 2 && (
            <Step2Segments
              videoPaths={state.videoPaths}
              segments={state.segments}
              onChange={(segments) => updateState({ segments })}
            />
          )}
          {step === 3 && (
            <Step3Driver
              segments={state.segments}
              selectedDriver={state.selectedDriver}
              onChange={(driver) => updateState({ selectedDriver: driver })}
            />
          )}
          {step === 4 && <Step4Verify segments={state.segments} />}
          {step === 5 && (
            <Step5Confirm
              state={state}
              onNameChange={(name) => updateState({ projectName: name })}
              onComplete={onComplete}
            />
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-8 py-4">
          <Button variant="ghost" onClick={step === 1 ? onCancel : goBack}>
            {step === 1 ? 'Cancel' : '← Back'}
          </Button>
          {step < 5 && (
            <Button onClick={handleContinue} disabled={!canContinue || joining}>
              {joining ? 'Joining…' : 'Continue'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
