import { StepIndicator } from '@/components/app/StepIndicator'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useEffect, useRef, useState } from 'react'
import type { ProjectData, SegmentConfig } from '../../../../types/project'
import { Step1Videos } from './steps/Step1Videos'
import { Step2Segments } from './steps/Step2Segments'
import { Step3Driver } from './steps/Step3Driver'
import { Step4Verify } from './steps/Step4Verify'
import { Step5Confirm } from './steps/Step5Confirm'

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
  const [segmentSubForm, setSegmentSubForm] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinProgress, setJoinProgress] = useState(0)
  const [joinError, setJoinError] = useState<string | null>(null)
  const joinProgressCleanupRef = useRef<(() => void) | null>(null)
  const [state, setState] = useState<WizardState>({
    videoPaths: [],
    segments: [],
    selectedDriver: '',
    projectName: '',
  })

  useEffect(() => {
    return () => {
      joinProgressCleanupRef.current?.()
      joinProgressCleanupRef.current = null
    }
  }, [])

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
    setJoinProgress(0)
    setJoinError(null)
  }

  async function handleContinue() {
    if (step === 1 && !state.joinedVideoPath) {
      setJoining(true)
      setJoinProgress(0)
      setJoinError(null)
      joinProgressCleanupRef.current?.()
      joinProgressCleanupRef.current = window.racedash.onJoinProgress((event) => {
        setJoinProgress(event.progress)
      })
      try {
        const { joinedPath } = await window.racedash.joinVideos(state.videoPaths)
        updateState({ joinedVideoPath: joinedPath })
        setJoinProgress(1)
        setJoining(false)
        joinProgressCleanupRef.current?.()
        joinProgressCleanupRef.current = null
        goNext()
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Failed to join video files')
        setJoining(false)
        joinProgressCleanupRef.current?.()
        joinProgressCleanupRef.current = null
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
    <Dialog open={true} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent
        className="flex w-172.5 flex-col gap-0 p-0"
        style={{ minHeight: '630px', maxHeight: '90vh' }}
      >
        <div className="shrink-0 border-b border-border px-8 py-6">
          <StepIndicator currentStep={step} steps={STEP_LABELS} />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {step === 1 && (
            <Step1Videos
              videoPaths={state.videoPaths}
              onChange={handleVideoPathsChange}
              joining={joining}
              joinProgress={joinProgress}
              joinError={joinError ?? undefined}
            />
          )}
          {step === 2 && (
            <Step2Segments
              videoPaths={state.videoPaths}
              segments={state.segments}
              onChange={(segments) => updateState({ segments })}
              onSubFormChange={setSegmentSubForm}
            />
          )}
          {step === 3 && (
            <Step3Driver
              segments={state.segments}
              selectedDriver={state.selectedDriver}
              onChange={(driver) => updateState({ selectedDriver: driver })}
            />
          )}
          {step === 4 && <Step4Verify segments={state.segments} selectedDriver={state.selectedDriver} />}
          {step === 5 && (
            <Step5Confirm
              state={state}
              onNameChange={(name) => updateState({ projectName: name })}
              onComplete={onComplete}
            />
          )}
        </div>

        <div className={`flex shrink-0 items-center justify-between border-t border-border px-8 py-4${segmentSubForm ? ' hidden' : ''}`}>
          <Button variant="ghost" onClick={step === 1 ? onCancel : goBack}>
            {step === 1 ? 'Cancel' : '← Back'}
          </Button>
          {step < 5 && (
            <Button onClick={handleContinue} disabled={!canContinue || joining}>
              {joining ? 'Joining…' : 'Continue'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
