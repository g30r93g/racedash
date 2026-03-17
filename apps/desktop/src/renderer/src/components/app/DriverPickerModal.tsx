import React, { useEffect, useState } from 'react'
import type { DriversResult } from '../../../../types/ipc'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

  const drivers = driversResult?.segments.flatMap((seg) =>
    seg.drivers.map((d) => ({ kart: d.kart, name: d.name }))
  ) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px] max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Choose Driver</DialogTitle>
        </DialogHeader>

        {loading && (
          <p className="text-xs text-muted-foreground py-4">Loading drivers…</p>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">Failed to load drivers</p>
            <p className="mt-1 font-mono text-xs opacity-80">{error}</p>
          </div>
        )}

        {!loading && !error && driversResult && (
          drivers.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No drivers found.</p>
          ) : (
            <div className="min-h-0 overflow-y-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-[11px] font-medium uppercase tracking-wide">#</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide">Driver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map((d) => (
                    <TableRow
                      key={d.name}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => { onSelect(d.name); onOpenChange(false) }}
                    >
                      <TableCell className="py-1.5 font-mono text-xs text-muted-foreground">
                        {d.kart ? d.kart.padStart(3, ' ') : '—'}
                      </TableCell>
                      <TableCell className="py-1.5 text-sm text-foreground font-medium">
                        {d.name}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}

        <div className="mt-2 flex justify-end border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
