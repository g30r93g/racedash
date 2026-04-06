import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CutRegion } from '../../../../../types/videoEditing'

function frameToTimestamp(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  const f = Math.round((totalSeconds % 1) * fps)
  return `${m}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
}

function timestampToFrame(ts: string, fps: number): number | null {
  const parts = ts.split(':').map(Number)
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
    return Math.round((parts[0] * 60 + parts[1] + parts[2] / fps) * fps)
  }
  if (parts.length === 2 && parts.every((p) => !isNaN(p))) {
    return Math.round((parts[0] * 60 + parts[1]) * fps)
  }
  return null
}

interface CutRegionPopoverProps {
  cut: CutRegion
  fps: number
  onUpdate: (updated: CutRegion) => void
  onDelete: (id: string) => void
  children: React.ReactNode
}

export function CutRegionPopover({ cut, fps, onUpdate, onDelete, children }: CutRegionPopoverProps): React.ReactElement {
  const [inStr, setInStr] = useState(frameToTimestamp(cut.startFrame, fps))
  const [outStr, setOutStr] = useState(frameToTimestamp(cut.endFrame, fps))

  const handleSave = () => {
    const newStart = timestampToFrame(inStr, fps)
    const newEnd = timestampToFrame(outStr, fps)
    if (newStart !== null && newEnd !== null && newStart < newEnd) {
      onUpdate({ ...cut, startFrame: newStart, endFrame: newEnd })
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">In (m:ss:ff)</Label>
          <Input value={inStr} onChange={(e) => setInStr(e.target.value)} onBlur={handleSave} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Out (m:ss:ff)</Label>
          <Input value={outStr} onChange={(e) => setOutStr(e.target.value)} onBlur={handleSave} className="h-7 text-xs" />
        </div>
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(cut.id)}>
          Delete
        </Button>
      </PopoverContent>
    </Popover>
  )
}
