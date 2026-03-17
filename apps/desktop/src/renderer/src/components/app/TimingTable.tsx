import React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatLapTime(ms: number): string {
  const totalMs = Math.round(ms)
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export interface LapRow {
  lap: number
  timeMs: number
  position: number | null
  lapTimeLabel?: string  // if present, rendered instead of formatting timeMs
}

interface TimingTableProps {
  rows: LapRow[]
  bestLapTimeMs?: number
}

export function TimingTable({ rows, bestLapTimeMs }: TimingTableProps): React.ReactElement {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide">LAP</TableHead>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide">TIME</TableHead>
          <TableHead className="text-[11px] font-medium uppercase tracking-wide">POS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const isBest = bestLapTimeMs !== undefined && row.timeMs === bestLapTimeMs
          const timeDisplay = row.lapTimeLabel ?? formatLapTime(row.timeMs)
          return (
            <TableRow
              key={index}
              className={isBest ? 'text-foreground font-medium' : 'text-muted-foreground'}
            >
              <TableCell className="py-1">{row.lap}</TableCell>
              <TableCell className="py-1 font-medium">{timeDisplay}</TableCell>
              <TableCell className="py-1">{row.position != null ? `P${row.position}` : '—'}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
