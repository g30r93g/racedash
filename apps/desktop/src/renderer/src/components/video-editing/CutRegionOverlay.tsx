import React, { useCallback, useRef } from 'react'
import type { CutRegion } from '../../../../../types/videoEditing'
import { pct } from '@/components/video/timeline/types'

interface CutRegionOverlayProps {
  cuts: CutRegion[]
  duration: number
  fps: number
  onClick?: (cut: CutRegion) => void
  onUpdate?: (updated: CutRegion) => void
}

type DragEdge = 'start' | 'end'

interface DragState {
  cutId: string
  edge: DragEdge
  initialFrame: number
  initialClientX: number
  /** Pixels per second — computed from the track container width and duration */
  pxPerSec: number
}

function CutRegionItem({
  cut,
  duration,
  fps,
  onClick,
  onUpdate,
}: {
  cut: CutRegion
  duration: number
  fps: number
  onClick?: (cut: CutRegion) => void
  onUpdate?: (updated: CutRegion) => void
}): React.ReactElement {
  const dragRef = useRef<DragState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const startDrag = useCallback(
    (e: React.PointerEvent, edge: DragEdge) => {
      e.stopPropagation()
      e.preventDefault()

      // Walk up to the track container to measure total width
      const trackEl = containerRef.current?.parentElement
      if (!trackEl) return
      const trackWidth = trackEl.clientWidth
      const pxPerSec = trackWidth / duration

      dragRef.current = {
        cutId: cut.id,
        edge,
        initialFrame: edge === 'start' ? cut.startFrame : cut.endFrame,
        initialClientX: e.clientX,
        pxPerSec,
      }

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
    },
    [cut, duration],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !onUpdate) return

      const deltaPx = e.clientX - drag.initialClientX
      const deltaSec = deltaPx / drag.pxPerSec
      const deltaFrames = Math.round(deltaSec * fps)
      const newFrame = Math.max(0, drag.initialFrame + deltaFrames)

      if (drag.edge === 'start') {
        if (newFrame < cut.endFrame) {
          onUpdate({ ...cut, startFrame: newFrame })
        }
      } else {
        if (newFrame > cut.startFrame) {
          onUpdate({ ...cut, endFrame: newFrame })
        }
      }
    },
    [cut, fps, onUpdate],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const startSec = cut.startFrame / fps
  const widthSec = (cut.endFrame - cut.startFrame) / fps

  return (
    <div
      ref={containerRef}
      className="absolute inset-y-0 cursor-pointer bg-red-500/15 hover:bg-red-500/25 transition-colors"
      style={{
        left: pct(startSec, duration),
        width: pct(widthSec, duration),
        backgroundImage:
          'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 8px)',
      }}
      onClick={() => onClick?.(cut)}
    >
      {/* Left (start) drag handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-red-400/50 active:bg-red-400/70 transition-colors"
        onPointerDown={(e) => startDrag(e, 'start')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {/* Right (end) drag handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-red-400/50 active:bg-red-400/70 transition-colors"
        onPointerDown={(e) => startDrag(e, 'end')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  )
}

export function CutRegionOverlay({
  cuts,
  duration,
  fps,
  onClick,
  onUpdate,
}: CutRegionOverlayProps): React.ReactElement {
  return (
    <>
      {cuts.map((cut) => (
        <CutRegionItem
          key={cut.id}
          cut={cut}
          duration={duration}
          fps={fps}
          onClick={onClick}
          onUpdate={onUpdate}
        />
      ))}
    </>
  )
}
