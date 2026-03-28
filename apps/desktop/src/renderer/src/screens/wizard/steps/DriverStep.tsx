import { Spinner } from '@/components/loaders/Spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Check, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { SegmentConfig } from '../../../../../types/project'

interface DriverStepProps {
  segments: SegmentConfig[]
  selectedDrivers: Record<string, string>
  onChange: (drivers: Record<string, string>) => void
}

interface DriverEntry {
  kart: string
  name: string
}

export function DriverStep({ segments, selectedDrivers, onChange }: DriverStepProps) {
  const [driversBySegment, setDriversBySegment] = useState<Record<string, DriverEntry[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchDrivers = useCallback(async () => {
    if (segments.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.racedash.previewDrivers(segments)
      const bySegment: Record<string, DriverEntry[]> = {}
      result.segments.forEach((seg: { config: { label?: string; source: string }; drivers: DriverEntry[] }) => {
        bySegment[seg.config.label ?? seg.config.source] = seg.drivers
      })
      setDriversBySegment(bySegment)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch drivers')
    } finally {
      setLoading(false)
    }
  }, [segments])

  useEffect(() => {
    fetchDrivers()
  }, [fetchDrivers])

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
          Choose which driver's perspective to render for each session. The overlay will highlight this driver in the
          leaderboard and track their position.
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
                <Check className="ml-1.5 h-3 w-3 text-primary" aria-hidden="true" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {segments.map((seg) => {
          const drivers = driversBySegment[seg.label] ?? []
          const filtered = search
            ? drivers.filter(
                (d) =>
                  d.name.toLowerCase().includes(search.toLowerCase()) ||
                  d.kart.toLowerCase().includes(search.toLowerCase()),
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
              ) : error ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button variant="outline" size="sm" onClick={fetchDrivers}>
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
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
                              : 'border-border bg-background text-foreground hover:bg-accent',
                          )}
                          onClick={() => onChange({ ...selectedDrivers, [seg.label]: driver.name })}
                        >
                          <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">
                            {driver.kart}
                          </span>
                          <span className="flex-1 text-sm">{driver.name}</span>
                          <Check
                            className="h-4 w-4 shrink-0 text-primary"
                            style={{ opacity: isSelected ? 1 : 0 }}
                            aria-hidden="true"
                          />
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
