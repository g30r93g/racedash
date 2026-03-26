import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export function UpdateBanner(): React.ReactElement | null {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubDownloaded = window.racedash.onUpdateDownloaded(() => setReady(true))
    return unsubDownloaded
  }, [])

  if (!ready || dismissed) return null

  return (
    <div
      className="flex items-center justify-between gap-4 bg-blue-600 px-4 py-1.5 text-xs text-white"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <span>A new version is ready.</span>
      <div className="flex items-center gap-3">
        <Button
          variant="link"
          onClick={() => window.racedash.installUpdate()}
          className="h-auto p-0 font-medium text-white"
        >
          Restart to update
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="h-5 w-5 opacity-60 hover:opacity-100"
        >
          ✕
        </Button>
      </div>
    </div>
  )
}
