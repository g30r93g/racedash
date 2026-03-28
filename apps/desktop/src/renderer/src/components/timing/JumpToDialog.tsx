import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface JumpToDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTime: number
  fps: number
  duration: number
  onSeek: (time: number) => void
}

function formatTimecode(seconds: number): string {
  const hh = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  const ss = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/** Parse HH:MM:SS.mmm or MM:SS.mmm or SS.mmm — returns seconds, or null if invalid */
function parseTimecode(value: string): number | null {
  const parts = value.trim().split(':')
  let h = 0,
    m = 0,
    s = 0
  if (parts.length === 3) {
    h = parseInt(parts[0], 10)
    m = parseInt(parts[1], 10)
    s = parseFloat(parts[2])
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10)
    s = parseFloat(parts[1])
  } else if (parts.length === 1) {
    s = parseFloat(parts[0])
  } else {
    return null
  }
  if (isNaN(h) || isNaN(m) || isNaN(s)) return null
  return h * 3600 + m * 60 + s
}

export function JumpToDialog({
  open,
  onOpenChange,
  currentTime,
  fps,
  duration,
  onSeek,
}: JumpToDialogProps): React.ReactElement {
  const [frameInput, setFrameInput] = useState('')
  const [timecodeInput, setTimecodeInput] = useState('')

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      setFrameInput(String(Math.floor(currentTime * fps)))
      setTimecodeInput(formatTimecode(currentTime))
    }
    onOpenChange(isOpen)
  }

  function handleFrameChange(value: string) {
    setFrameInput(value)
    const f = parseInt(value, 10)
    if (!isNaN(f)) setTimecodeInput(formatTimecode(f / fps))
  }

  function handleTimecodeChange(value: string) {
    setTimecodeInput(value)
    const t = parseTimecode(value)
    if (t !== null) setFrameInput(String(Math.floor(t * fps)))
  }

  function handleJump() {
    const t = parseTimecode(timecodeInput)
    if (t !== null) onSeek(Math.min(Math.max(t, 0), duration))
    onOpenChange(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleJump()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="w-80">
        <DialogHeader>
          <DialogTitle>Jump to</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jump-frame">Frame</Label>
            <Input
              id="jump-frame"
              value={frameInput}
              onChange={(e) => handleFrameChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="0"
              className="font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jump-timecode">Timecode</Label>
            <Input
              id="jump-timecode"
              value={timecodeInput}
              onChange={(e) => handleTimecodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="00:00:00.000"
              className="font-mono"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleJump}>Jump</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
