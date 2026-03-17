import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import React from 'react'

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
  activeLapNumber?: number
  mode?: 'practice' | 'qualifying' | 'race'
}

export function TimingTable({ rows, bestLapTimeMs, activeLapNumber, mode }: TimingTableProps): React.ReactElement {
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
          const isFastestHighlight = isBest && mode !== 'race'
          const isActive = activeLapNumber !== undefined && row.lap === activeLapNumber
          const timeDisplay = row.lapTimeLabel ?? formatLapTime(row.timeMs)

          const prevPosition = index > 0 ? rows[index - 1].position : null
          const positionDelta =
            mode === 'race' && row.lap > 0 && row.position != null && prevPosition != null
              ? prevPosition - row.position
              : null

          return (
            <TableRow
              key={index}
              className={cn(
                'transition-none hover:bg-inherit',
                isFastestHighlight && 'border-l-2 border-l-[#3DD73D]',
                isFastestHighlight
                  ? 'bg-lap-fastest text-lap-fastest-foreground font-medium'
                  : isActive
                    ? 'bg-[#3DD73D]/35 text-foreground'
                    : isBest
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground',
              )}
            >
              <TableCell className="py-1">{row.lap === 0 ? 'Grid' : row.lap}</TableCell>
              <TableCell className="py-1 font-medium">{timeDisplay}</TableCell>
              <TableCell className="py-1">
                {row.position != null ? (
                  <span className="flex items-center gap-2">
                    <span>{`P${row.position}`}</span>
                    {positionDelta !== null && positionDelta !== 0 && (
                      <span className={cn(
                        'text-[10px] font-bold',
                        positionDelta > 0 ? 'text-green-500' : 'text-red-500',
                      )}>
                        {positionDelta > 0 ? `+${positionDelta}` : `${positionDelta}`}
                      </span>
                    )}
                  </span>
                ) : '—'}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
