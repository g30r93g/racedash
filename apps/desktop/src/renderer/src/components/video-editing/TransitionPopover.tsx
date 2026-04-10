import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Transition, TransitionType } from '../../../../../types/videoEditing'

const TYPE_LABELS: Record<TransitionType, string> = {
  fadeFromBlack: 'Fade From Black',
  fadeToBlack: 'Fade To Black',
  fadeThroughBlack: 'Fade Through Black',
  crossfade: 'Crossfade',
}

interface TransitionPopoverProps {
  transition: Transition
  allowedTypes: TransitionType[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onUpdate: (updated: Transition) => void
  onDelete: (id: string) => void
  children: React.ReactNode
}

export function TransitionPopover({
  transition,
  allowedTypes,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  children,
}: TransitionPopoverProps): React.ReactElement {
  const [durationStr, setDurationStr] = useState(String(transition.durationMs))

  const handleTypeChange = (type: string) => {
    onUpdate({ ...transition, type: type as TransitionType })
  }

  const handleDurationBlur = () => {
    const ms = parseInt(durationStr, 10)
    if (!isNaN(ms) && ms > 0) {
      onUpdate({ ...transition, durationMs: ms })
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={transition.type} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedTypes.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">{TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duration (ms)</Label>
          <Input value={durationStr} onChange={(e) => setDurationStr(e.target.value)} onBlur={handleDurationBlur} className="h-7 text-xs" />
        </div>
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(transition.id)}>
          Delete
        </Button>
      </PopoverContent>
    </Popover>
  )
}
