import React from 'react'
import { cn } from '@/lib/utils'

interface WizardStepIndicatorProps {
  currentStep: number
  steps: readonly string[]
}

export function WizardStepIndicator({ currentStep, steps }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center" role="list" aria-label="Project creation progress">
      {steps.map((label, index) => {
        const stepNumber = index + 1
        const isComplete = stepNumber < currentStep
        const isCurrent = stepNumber === currentStep

        return (
          <React.Fragment key={stepNumber}>
            {index > 0 && (
              <div
                className={cn(
                  'h-px flex-1',
                  isComplete ? 'bg-green-500' : 'bg-border'
                )}
              />
            )}

            <div className="flex flex-col items-center gap-1.5" role="listitem">
              <div
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  isComplete && 'border-green-500 bg-green-500 text-white',
                  isCurrent && 'border-primary bg-primary text-primary-foreground',
                  !isComplete && !isCurrent && 'border-border bg-transparent text-muted-foreground'
                )}
              >
                {isComplete ? (
                  <svg
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              <span
                className={cn(
                  'text-[11px]',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
