import React, { useEffect, useState } from 'react'
import type { SegmentConfig } from '../../../../../types/project'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/loaders/Spinner'
import { ExternalLink, Check } from 'lucide-react'

interface DriverStepProps {
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
  onChange: (drivers: Record<string, string>) => void
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

export function DriverStep({ segments, selectedDrivers, onChange }: DriverStepProps) {
  const [driversBySegment, setDriversBySegment] = useState<Record<string, DriverEntry[]>>({})
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const result = await window.racedash.previewDrivers(segments)
        const bySegment: Record<string, DriverEntry[]> = {}
        result.segments.forEach((seg: { config: { label?: string; source: string }; drivers: DriverEntry[] }) => {
          bySegment[seg.config.label ?? seg.config.source] = seg.drivers
        })
        setDriversBySegment(bySegment)
      } catch {
        const bySegment: Record<string, DriverEntry[]> = {}
        segments.forEach((seg) => { bySegment[seg.label] = PLACEHOLDER_DRIVERS })
        setDriversBySegment(bySegment)
      } finally {
        setLoading(false)
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
          Choose which driver's perspective to render for each session. The overlay will highlight
          this driver in the leaderboard and track their position.
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
              {selectedDrivers[seg.label] && (
                <ExternalLink className="ml-1.5 h-3 w-3 text-primary" aria-hidden="true" />
              )}
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
          const selectedForSegment = selectedDrivers[seg.label] ?? ''

          return (
            <TabsContent key={seg.label} value={seg.label} className="mt-4">
              {loading ? (
                <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
                  <Spinner name="checkerboard" size="1.5rem" color="#3b82f6" speed={2.5} ignoreReducedMotion />
                  Loading drivers…
                </div>
              ) : (
              <>
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
                  const isSelected = selectedForSegment === driver.name
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
                      onClick={() => onChange({ ...selectedDrivers, [seg.label]: driver.name })}
                    >
                      <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">
                        {driver.kart}
                      </span>
                      <span className="flex-1 text-sm">{driver.name}</span>
                      <Check className="h-4 w-4 shrink-0 text-primary" style={{ opacity: isSelected ? 1 : 0 }} aria-hidden="true" />
                    </Button>
                  )
                })}
              </div>
              </>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
