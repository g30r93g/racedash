import { WifiOff } from 'lucide-react'
import React from 'react'

interface OfflineStateProps {
  /** What feature is unavailable, e.g. "Cloud Renders" or "your account" */
  feature: string
}

export function OfflineState({ feature }: OfflineStateProps): React.ReactElement {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <WifiOff size={20} className="text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">You're offline</p>
        <p className="text-xs text-muted-foreground">
          Connect to the internet to access {feature}.
        </p>
      </div>
    </div>
  )
}
