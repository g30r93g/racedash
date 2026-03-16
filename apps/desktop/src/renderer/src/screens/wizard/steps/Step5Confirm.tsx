import React from 'react'
import type { WizardState } from '../ProjectCreationWizard'
import type { ProjectData } from '../../../../../types/project'

interface Step5ConfirmProps {
  state: WizardState
  onNameChange: (name: string) => void
  onComplete: (project: ProjectData) => void
}

export function Step5Confirm(_props: Step5ConfirmProps) {
  return <div className="text-sm text-muted-foreground">Step 5 — Confirm (stub)</div>
}
