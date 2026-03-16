import React, { useEffect, useState } from 'react'
import type { SegmentConfig } from '../../../../../types/project'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface Step4VerifyProps {
  segments: SegmentConfig[]
}

interface LapRow {
  lap: number
  lapTime: string
  position: number
  isBest: boolean
}

const PLACEHOLDER_LAPS: LapRow[] = [
  { lap: 1, lapTime: '1:23.456', position: 3, isBest: false },
  { lap: 2, lapTime: '1:21.089', position: 2, isBest: true },
  { lap: 3, lapTime: '1:22.311', position: 2, isBest: false },
]

export function Step4Verify({ segments }: Step4VerifyProps) {
  const [lapsBySegment, setLapsBySegment] = useState<Record<string, LapRow[]>>({})

  useEffect(() => {
    const load = async () => {
      try {
        await window.racedash.generateTimestamps({ configPath: '' })
        throw new Error('not implemented')
      } catch {
        const bySegment: Record<string, LapRow[]> = {}
        segments.forEach((seg) => { bySegment[seg.label] = PLACEHOLDER_LAPS })
        setLapsBySegment(bySegment)
      }
    }
    if (segments.length > 0) load()
  }, [segments])

  if (segments.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="text-base font-semibold text-foreground">Verify lap data</h2>
        <p className="text-sm text-muted-foreground">No segments defined.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Verify lap data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the lap times loaded from your config. Check that laps and positions look
          correct before rendering.
        </p>
      </div>

      <Tabs defaultValue={segments[0].label}>
        <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent px-0">
          {segments.map((seg) => (
            <TabsTrigger
              key={seg.label}
              value={seg.label}
              className="-mb-px rounded-none border-b-2 border-transparent px-4 py-2 text-sm capitalize text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {seg.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {segments.map((seg) => {
          const laps = lapsBySegment[seg.label] ?? []
          return (
            <TabsContent key={seg.label} value={seg.label} className="mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Lap', 'Lap time', 'Position'].map((h) => (
                      <th key={h} className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {laps.map((row) => (
                    <tr
                      key={row.lap}
                      className={cn('border-b border-border/50', row.isBest && 'bg-primary/10')}
                    >
                      <td className="py-2 text-foreground">{row.lap}</td>
                      <td className={cn('py-2', row.isBest ? 'font-semibold text-primary' : 'text-foreground')}>
                        {row.lapTime}
                      </td>
                      <td className="py-2 text-foreground">{row.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
