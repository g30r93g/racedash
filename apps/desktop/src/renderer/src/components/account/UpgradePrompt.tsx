import React from 'react'
import { Button } from '@/components/ui/button'

interface UpgradePromptProps {
  feature: string
  onUpgrade: () => void
  onDismiss: () => void
  inline?: boolean
}

export function UpgradePrompt({ feature, onUpgrade, onDismiss, inline }: UpgradePromptProps): React.ReactElement {
  if (inline) {
    return (
      <div className="rounded-md border border-border bg-accent/50 p-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Pro feature:</span> {feature}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onUpgrade}>
          Upgrade to Pro
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg border border-border bg-background p-6 shadow-lg">
        <h3 className="mb-2 text-sm font-semibold text-foreground">This feature requires RaceDash Cloud Pro</h3>
        <p className="mb-4 text-xs text-muted-foreground">{feature}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDismiss} className="flex-1">
            Dismiss
          </Button>
          <Button size="sm" onClick={onUpgrade} className="flex-1">
            Upgrade to Pro
          </Button>
        </div>
      </div>
    </div>
  )
}
