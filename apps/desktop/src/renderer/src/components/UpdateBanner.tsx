import React, { useEffect, useState } from 'react'

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
        <button
          className="font-medium underline hover:no-underline"
          onClick={() => window.racedash.installUpdate()}
        >
          Restart to update
        </button>
        <button
          className="opacity-60 hover:opacity-100"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
