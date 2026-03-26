import React from 'react'
import { cn } from '@/lib/utils'

interface StepIndicatorProps {
  steps: readonly string[]
  currentStep: number  // 1-based
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps): React.ReactElement {
  const indicatorSize = 28

  return (
    <div className="flex items-start" role="list" aria-label="Progress">
      {steps.map((label, index) => {
        const stepNumber = index + 1
        const isComplete = stepNumber < currentStep
        const isCurrent = stepNumber === currentStep

        return (
          <div key={stepNumber} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" role="listitem">
            <div className="relative flex w-full items-center justify-center">
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 top-1/2 h-px -translate-y-1/2',
                    stepNumber <= currentStep ? 'bg-green-500' : 'bg-border'
                  )}
                  style={{ right: `calc(50% + ${indicatorSize / 2}px)` }}
                />
              )}
              {index < steps.length - 1 && (
                <div
                  aria-hidden="true"
                  className={cn(
                    'absolute right-0 top-1/2 h-px -translate-y-1/2',
                    isComplete ? 'bg-green-500' : 'bg-border'
                  )}
                  style={{ left: `calc(50% + ${indicatorSize / 2}px)` }}
                />
              )}
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
            </div>
            <span
              className={cn(
                'text-center text-[11px]',
                isCurrent ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
