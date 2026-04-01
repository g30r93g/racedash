import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import React, { useRef, useEffect, useState } from 'react'
import { JumpToDialog } from '../timing/JumpToDialog'

interface VideoPlaybackControlsProps {
  duration: number
  currentTime: number
  fps: number
  playing: boolean
  muted: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onMuteToggle: () => void
}

function formatTimecode(seconds: number): string {
  const hh = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  const ss = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function VideoPlaybackControls({
  duration,
  currentTime,
  fps,
  playing,
  muted,
  onPlay,
  onPause,
  onSeek,
  onMuteToggle,
}: VideoPlaybackControlsProps): React.ReactElement {
  const frame = Math.floor(currentTime * fps)
  const [jumpOpen, setJumpOpen] = useState(false)
  const rangeRef = useRef<HTMLInputElement>(null)

  // During playback, update the native range slider via DOM to avoid
  // Radix Slider re-renders on every frame.
  useEffect(() => {
    if (playing && rangeRef.current) {
      rangeRef.current.value = String(currentTime)
    }
  }, [currentTime, playing])

  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 border-t border-border bg-background px-3 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={playing ? onPause : onPlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="h-7 w-7 shrink-0"
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{playing ? 'Pause' : 'Play'}</TooltipContent>
        </Tooltip>

        {/* Use Radix Slider when paused (nice UI) or native range during playback (no re-render cost) */}
        {playing ? (
          <input
            ref={rangeRef}
            type="range"
            min={0}
            max={duration || 1}
            step={0.001}
            defaultValue={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1 accent-primary"
            aria-label="Playback position"
          />
        ) : (
          <Slider
            min={0}
            max={duration || 1}
            step={0.001}
            value={[currentTime]}
            onValueChange={([v]) => onSeek(v)}
            className="flex-1"
            aria-label="Playback position"
          />
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onMuteToggle}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="h-7 w-7 shrink-0"
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{muted ? 'Unmute' : 'Mute'}</TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          className="h-7 shrink-0 px-2 font-mono text-xs text-muted-foreground"
          onClick={() => setJumpOpen(true)}
        >
          {frame} F &bull; {formatTimecode(currentTime)}
        </Button>
      </div>

      <JumpToDialog
        open={jumpOpen}
        onOpenChange={setJumpOpen}
        currentTime={currentTime}
        fps={fps}
        duration={duration}
        onSeek={onSeek}
      />
    </TooltipProvider>
  )
}
