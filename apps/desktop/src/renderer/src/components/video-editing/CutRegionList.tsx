import React from 'react'
import { Button } from '@/components/ui/button'
import { Plus, AlertTriangle } from 'lucide-react'
import type { CutRegion } from '../../../../../types/videoEditing'
import { CutRegionPopover } from './CutRegionPopover'

function formatRange(cut: CutRegion, fps: number): string {
  const toTime = (frame: number) => {
    const s = frame / fps
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  return `${toTime(cut.startFrame)} – ${toTime(cut.endFrame)}`
}

interface CutRegionListProps {
  cuts: CutRegion[]
  fps: number
  warningCutIds?: Set<string>
  onAdd: () => void
  onUpdate: (updated: CutRegion) => void
  onDelete: (id: string) => void
  disabled?: boolean
}

export function CutRegionList({
  cuts,
  fps,
  warningCutIds,
  onAdd,
  onUpdate,
  onDelete,
  disabled,
}: CutRegionListProps): React.ReactElement {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Cuts</span>
        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={onAdd} disabled={disabled}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {cuts.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No cuts. Position the playhead in dead space and click +.</p>
      ) : (
        <div className="space-y-1">
          {cuts.map((cut) => (
            <CutRegionPopover key={cut.id} cut={cut} fps={fps} onUpdate={onUpdate} onDelete={onDelete}>
              <button className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-accent">
                <span className="flex-1 truncate">{formatRange(cut, fps)}</span>
                {warningCutIds?.has(cut.id) && <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-500" />}
              </button>
            </CutRegionPopover>
          ))}
        </div>
      )}
    </section>
  )
}
