import React from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface VideoPlaybackControlsProps {
  duration: number
  currentTime: number
  playing: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
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
  playing,
  onPlay,
  onPause,
  onSeek,
}: VideoPlaybackControlsProps): React.ReactElement {
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
              {playing ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <rect x="2" y="1" width="3" height="10" />
                  <rect x="7" y="1" width="3" height="10" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                  <polygon points="2,1 11,6 2,11" />
                </svg>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{playing ? 'Pause' : 'Play'}</TooltipContent>
        </Tooltip>

        <Slider
          min={0}
          max={duration || 1}
          step={0.001}
          value={[currentTime]}
          onValueChange={([v]) => onSeek(v)}
          className="flex-1"
          aria-label="Playback position"
        />

        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatTimecode(currentTime)}
        </span>
      </div>
    </TooltipProvider>
  )
}
