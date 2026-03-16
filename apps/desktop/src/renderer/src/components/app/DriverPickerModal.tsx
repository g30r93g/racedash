import React, { useEffect, useState } from 'react'
import type { DriversResult } from '../../../../types/ipc'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DriverPickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  configPath: string
  onSelect: (driverName: string) => void
}

export function DriverPickerModal({
  open,
  onOpenChange,
  configPath,
  onSelect,
}: DriverPickerModalProps): React.ReactElement {
  const [driversResult, setDriversResult] = useState<DriversResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    window.racedash
      .listDrivers({ configPath })
      .then((result) => setDriversResult(result))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [open, configPath])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[360px]">
        <DialogHeader>
          <DialogTitle>Choose Driver</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-xs text-muted-foreground">Loading drivers…</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!loading && !error && driversResult && (
          <ul className="flex flex-col gap-1">
            {driversResult.segments.flatMap((seg) =>
              seg.drivers.map((d) => (
                <li key={`${seg.config.source}-${d.name}`}>
                  <button
                    className="w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                    onClick={() => { onSelect(d.name); onOpenChange(false) }}
                  >
                    {d.kart ? `[${d.kart.padStart(3, ' ')}] ${d.name}` : d.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
