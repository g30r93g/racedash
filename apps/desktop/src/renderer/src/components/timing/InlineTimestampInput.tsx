import React, { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// hh:mm:ss.ms, mm:ss.ms, or "1234 F" / "1234F"
const VALID_RE = /^\d{1,2}:\d{2}:\d{2}\.\d{1,3}$|^\d{1,2}:\d{2}\.\d{1,3}$|^\d+\s*F$/i

function formatTime(frame: number, fps: number): string {
  const totalSeconds = frame / fps
  const mm = Math.floor(totalSeconds / 60)
  const ss = Math.floor(totalSeconds % 60)
  const ms = Math.floor((totalSeconds % 1) * 1000)
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function parseToFrame(value: string, fps: number): number | null {
  const v = value.trim()

  const frameMatch = v.match(/^(\d+)\s*F$/i)
  if (frameMatch) return parseInt(frameMatch[1], 10)

  const hmsMatch = v.match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/)
  if (hmsMatch) {
    const totalSeconds =
      parseInt(hmsMatch[1]) * 3600 +
      parseInt(hmsMatch[2]) * 60 +
      parseInt(hmsMatch[3]) +
      parseInt(hmsMatch[4].padEnd(3, '0')) / 1000
    return Math.round(totalSeconds * fps)
  }

  const msMatch = v.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/)
  if (msMatch) {
    const totalSeconds = parseInt(msMatch[1]) * 60 + parseInt(msMatch[2]) + parseInt(msMatch[3].padEnd(3, '0')) / 1000
    return Math.round(totalSeconds * fps)
  }

  return null
}

interface InlineTimestampInputProps {
  currentFrame: number
  fps: number
  onSeek: (frame: number) => void
}

export function InlineTimestampInput({ currentFrame, fps, onSeek }: InlineTimestampInputProps): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const isValid = VALID_RE.test(value.trim())

  function startEditing() {
    setValue(formatTime(currentFrame, fps))
    setEditing(true)
  }

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function commit() {
    const frame = parseToFrame(value, fps)
    if (frame !== null) {
      onSeek(frame)
      setEditing(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && isValid) commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" className="w-24 font-mono text-xs" onClick={startEditing}>
        {formatTime(currentFrame, fps)}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setEditing(false)}
        className="h-7 w-28 font-mono text-xs"
        placeholder="00:00.000"
      />
      <Button
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={!isValid}
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
      >
        <Check />
      </Button>
    </div>
  )
}
