import type { SegmentConfig } from '../../../../../types/project'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { LapTimeVerifyTable } from '@/components/app/LapTimeVerifyTable'

interface Step4VerifyProps {
  segments: SegmentConfig[]
  selectedDriver: string
}

export function Step4Verify({ segments, selectedDriver }: Step4VerifyProps) {
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
          Review the lap times loaded from your timing source. Check that laps look correct before rendering.
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

        {segments.map((seg) => (
          <TabsContent key={seg.label} value={seg.label} className="mt-4">
            <LapTimeVerifyTable segment={seg} selectedDriver={selectedDriver} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
