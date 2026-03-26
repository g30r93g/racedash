import { Spinner } from '@/components/loaders/Spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import React, { useEffect, useState } from 'react'
import type { LapPreview } from '../../../../types/ipc'
import type { SegmentConfig } from '../../../../types/project'

interface LapTimeVerifyTableProps {
  segment: SegmentConfig
  selectedDriver: string
}

type Status = 'loading' | 'loaded' | 'error'

function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const ms = totalMs % 1000
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function LapTimeVerifyTable({ segment, selectedDriver }: LapTimeVerifyTableProps): React.ReactElement {
  const [status, setStatus] = useState<Status>('loading')
  const [laps, setLaps] = useState<LapPreview[]>([])
  const [error, setError] = useState<string>('')

  useEffect(() => {
    setStatus('loading')
    setLaps([])
    setError('')

    window.racedash
      .previewTimestamps([segment], { [segment.label]: selectedDriver })
      .then((result) => {
        const match = result.find((s) => s.label === segment.label) ?? result[0]
        setLaps(match?.laps ?? [])
        setStatus('loaded')
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[LapTimeVerifyTable] previewTimestamps failed:', message)
        setError(message)
        setStatus('error')
      })
  }, [segment, selectedDriver])

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
        <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
        Fetching lap data…
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <p className="font-medium">Failed to load lap data</p>
        <p className="mt-1 font-mono text-xs opacity-80">{error}</p>
      </div>
    )
  }

  if (laps.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No laps found for <span className="font-medium">{selectedDriver}</span> in this segment.
      </p>
    )
  }

  const bestLapTime = Math.min(...laps.map((l) => l.lapTime))

  return (
    <div className="max-h-72 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] font-medium uppercase tracking-wide">LAP</TableHead>
            <TableHead className="text-[11px] font-medium uppercase tracking-wide">TIME</TableHead>
            <TableHead className="text-[11px] font-medium uppercase tracking-wide">POS</TableHead>
            <TableHead className="text-[11px] font-medium uppercase tracking-wide"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {laps.map((lap) => {
            const isBest = lap.lapTime === bestLapTime
            return (
              <TableRow key={lap.number} className={isBest ? 'text-foreground' : 'text-muted-foreground'}>
                <TableCell className="py-1">{lap.number}</TableCell>
                <TableCell className={`py-1 font-mono font-medium ${isBest ? 'text-primary' : ''}`}>
                  {formatLapTime(lap.lapTime)}
                </TableCell>
                <TableCell className="py-1">
                  {lap.position !== undefined ? `P${lap.position}` : '—'}
                </TableCell>
                <TableCell className="py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
                  {isBest ? 'BEST' : ''}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
