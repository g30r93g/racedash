import React, { useEffect, useState } from 'react'
import type { SegmentConfig } from '../../../../../types/project'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Step3DriverProps {
  segments: SegmentConfig[]
  selectedDriver: string
  onChange: (driver: string) => void
}

interface DriverEntry {
  kart: string
  name: string
}

const PLACEHOLDER_DRIVERS: DriverEntry[] = [
  { kart: '1', name: 'G. Gorzynski' },
  { kart: '2', name: 'A. Smith' },
  { kart: '3', name: 'B. Johnson' },
  { kart: '4', name: 'C. Williams' },
  { kart: '5', name: 'D. Brown' },
]

export function Step3Driver({ segments, selectedDriver, onChange }: Step3DriverProps) {
  const [driversBySegment, setDriversBySegment] = useState<Record<string, DriverEntry[]>>({})
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const result = await window.racedash.listDrivers({ configPath: '' })
        const bySegment: Record<string, DriverEntry[]> = {}
        result.segments.forEach((seg: { config: { label?: string; source: string }; drivers: DriverEntry[] }) => {
          bySegment[seg.config.label ?? seg.config.source] = seg.drivers
        })
        setDriversBySegment(bySegment)
      } catch {
        const bySegment: Record<string, DriverEntry[]> = {}
        segments.forEach((seg) => { bySegment[seg.label] = PLACEHOLDER_DRIVERS })
        setDriversBySegment(bySegment)
      }
    }
    if (segments.length > 0) load()
  }, [segments])

  if (segments.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="text-base font-semibold text-foreground">Select driver</h2>
        <p className="text-sm text-muted-foreground">No segments defined.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Select driver</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which driver's perspective to render. The overlay will highlight this driver
          in the leaderboard and track their position.
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
          const drivers = driversBySegment[seg.label] ?? []
          const filtered = search
            ? drivers.filter((d) =>
                d.name.toLowerCase().includes(search.toLowerCase()) ||
                d.kart.toLowerCase().includes(search.toLowerCase())
              )
            : drivers

          return (
            <TabsContent key={seg.label} value={seg.label} className="mt-4">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search drivers..."
                className="mb-3"
              />

              <div className="flex flex-col gap-1">
                {filtered.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">No drivers found.</p>
                )}
                {filtered.map((driver) => {
                  const isSelected = selectedDriver === driver.name
                  return (
                    <Button
                      key={driver.kart}
                      variant="ghost"
                      className={cn(
                        'flex h-auto w-full items-center justify-start gap-3 rounded-lg border px-4 py-2.5',
                        isSelected
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background text-foreground hover:bg-accent'
                      )}
                      onClick={() => onChange(driver.name)}
                    >
                      <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">
                        {driver.kart}
                      </span>
                      <span className="flex-1 text-sm">{driver.name}</span>
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </Button>
                  )
                })}
              </div>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
