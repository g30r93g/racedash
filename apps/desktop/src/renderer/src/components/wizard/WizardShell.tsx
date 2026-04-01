import { StepIndicator } from '@/components/layout/StepIndicator'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { ReactNode } from 'react'

export interface WizardShellProps {
  steps: readonly string[]
  currentStep: number // 0-indexed
  onNext: () => void
  onBack: () => void
  onCancel: () => void
  canContinue: boolean
  children: ReactNode
  /** Accessible title for the dialog (screen readers). Not rendered visually. */
  title?: string
  /** Accessible description for the dialog (screen readers). Not rendered visually. */
  description?: string
  isSubmitting?: boolean
  submitLabel?: string
  onSubmit?: () => void
  /** Hide the button bar (e.g. when a sub-form is active) */
  hideButtonBar?: boolean
}

export function WizardShell({
  steps,
  currentStep,
  onNext,
  onBack,
  onCancel,
  canContinue,
  children,
  title,
  description,
  isSubmitting,
  submitLabel,
  onSubmit,
  hideButtonBar,
}: WizardShellProps) {
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent
        className="flex w-172.5 flex-col gap-0 p-0"
        onInteractOutside={(event) => event.preventDefault()}
        style={{ minHeight: '630px', maxHeight: '90vh' }}
      >
        <DialogTitle className="sr-only">{title ?? 'Project wizard'}</DialogTitle>
        <DialogDescription className="sr-only">
          {description ?? `Step ${currentStep + 1} of ${steps.length}: ${steps[currentStep]}`}
        </DialogDescription>
        <div className="shrink-0 border-b border-border px-8 py-6">
          <StepIndicator currentStep={currentStep + 1} steps={steps} />
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>

        <div
          className={`flex shrink-0 items-center justify-between border-t border-border px-8 py-4${hideButtonBar ? ' hidden' : ''}`}
        >
          <Button variant="ghost" onClick={isFirstStep ? onCancel : onBack}>
            {isFirstStep ? 'Cancel' : '\u2190 Back'}
          </Button>
          {isLastStep && onSubmit ? (
            <Button onClick={onSubmit} disabled={!canContinue || isSubmitting}>
              {isSubmitting ? `${submitLabel ?? 'Saving'}…` : (submitLabel ?? 'Submit')}
            </Button>
          ) : (
            !isLastStep && (
              <Button onClick={onNext} disabled={!canContinue}>
                Continue
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
