import React, { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface ManualLapEntry {
  lap: number
  time: string
  position?: number
}

/** Validates a lap time string using the same formats the engine accepts: 58.123, 1:02.500, 0:15:30.5 */
export function isValidLapTime(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number.isFinite(parseFloat(trimmed))
  const parts = trimmed.split(':')
  if (parts.length === 2) return Number.isFinite(parseInt(parts[0], 10)) && Number.isFinite(parseFloat(parts[1]))
  if (parts.length === 3)
    return (
      Number.isFinite(parseInt(parts[0], 10)) &&
      Number.isFinite(parseInt(parts[1], 10)) &&
      Number.isFinite(parseFloat(parts[2]))
    )
  return false
}

function parseLapTimeSeconds(value: string): number {
  const t = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(t)) return parseFloat(t)
  const parts = t.split(':')
  if (parts.length === 2) return parseInt(parts[0], 10) * 60 + parseFloat(parts[1])
  if (parts.length === 3) return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2])
  return Infinity
}

function formatLapTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(3)}s`
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// ManualLapDialog
// ---------------------------------------------------------------------------

export function ManualLapDialog({
  open,
  onOpenChange,
  manualLaps,
  setManualLaps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  manualLaps: ManualLapEntry[]
  setManualLaps: (v: ManualLapEntry[]) => void
}) {
  const [draft, setDraft] = useState<ManualLapEntry[]>(manualLaps)
  const timeRefs = useRef<(HTMLInputElement | null)[]>([])

  // Sync draft when dialog opens; seed with one empty row if no laps exist
  React.useEffect(() => {
    if (open) {
      const initial = manualLaps.length > 0 ? manualLaps : [{ lap: 1, time: '' }]
      setDraft(initial)
      requestAnimationFrame(() => timeRefs.current[0]?.focus())
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function addLap() {
    const nextLap = draft.length === 0 ? 1 : draft[draft.length - 1].lap + 1
    const nextIndex = draft.length
    setDraft([...draft, { lap: nextLap, time: '' }])
    requestAnimationFrame(() => timeRefs.current[nextIndex]?.focus())
  }

  function removeLap(index: number) {
    const updated = draft.filter((_, i) => i !== index)
    const start = updated.length > 0 ? updated[0].lap : 1
    setDraft(updated.map((entry, i) => ({ ...entry, lap: start + i })))
  }

  function updateTime(index: number, time: string) {
    setDraft(draft.map((entry, i) => (i === index ? { ...entry, time } : entry)))
  }

  function updatePosition(index: number, value: string) {
    const position = value === '' ? undefined : parseInt(value, 10)
    if (value !== '' && !Number.isFinite(position)) return
    setDraft(draft.map((entry, i) => (i === index ? { ...entry, position } : entry)))
  }

  function handlePositionKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'Tab' && !e.shiftKey && index === draft.length - 1) {
      e.preventDefault()
      addLap()
    }
  }

  const allValid = draft.length > 0 && draft.every((e) => isValidLapTime(e.time))

  function handleSave() {
    setManualLaps(draft)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter lap times</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-1.5 px-0.5 pb-1 pr-3">
            {draft.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0" />
                <span className="flex-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Time
                </span>
                <span className="w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Pos
                </span>
                <span className="w-8 shrink-0" />
              </div>
            )}
            {draft.map((entry, index) => {
              const valid = entry.time === '' || isValidLapTime(entry.time)
              return (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    Lap {entry.lap}
                  </span>
                  <Input
                    ref={(el) => { timeRefs.current[index] = el }}
                    value={entry.time}
                    onChange={(e) => updateTime(index, e.target.value)}
                    placeholder="1:02.500"
                    className={`h-8 flex-1 font-mono text-sm ${!valid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  />
                  <Input
                    value={entry.position ?? ''}
                    onChange={(e) => updatePosition(index, e.target.value)}
                    onKeyDown={(e) => handlePositionKeyDown(e, index)}
                    placeholder="—"
                    className="h-8 w-16 shrink-0 text-center font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLap(index)}
                    tabIndex={-1}
                  >
                    ×
                  </Button>
                </div>
              )
            })}
            {draft.some((e) => e.time !== '' && !isValidLapTime(e.time)) && (
              <p className="text-xs text-destructive">Use format: 58.123 or 1:02.500</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" size="sm" onClick={addLap}>
            + Add lap
          </Button>
          <Button type="button" size="sm" disabled={!allValid} onClick={handleSave}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// ManualLapSummary
// ---------------------------------------------------------------------------

export function ManualLapSummary({
  manualLaps,
  onEdit,
}: {
  manualLaps: ManualLapEntry[]
  onEdit: () => void
}) {
  const hasLaps = manualLaps.length > 0
  const best = hasLaps
    ? Math.min(...manualLaps.filter((e) => isValidLapTime(e.time)).map((e) => parseLapTimeSeconds(e.time)))
    : Infinity

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lap times</p>
        <p className="mt-0.5 text-sm text-foreground">
          {hasLaps
            ? `${manualLaps.length} ${manualLaps.length === 1 ? 'lap' : 'laps'} — best ${best === Infinity ? '—' : formatLapTime(best)}`
            : 'No laps entered'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onEdit}>
        {hasLaps ? 'Edit' : 'Add laps'}
      </Button>
    </div>
  )
}
