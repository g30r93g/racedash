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
  // Keep latest cut in a ref so window event handlers always see current values
  const cutRef = useRef(cut)
  cutRef.current = cut

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

      // Attach move/up to window so dragging works even when pointer leaves the handle
      window.addEventListener('pointermove', onWindowPointerMove)
      window.addEventListener('pointerup', onWindowPointerUp)
    },
    [cut, duration],
  )

  const onWindowPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !onUpdate) return

      const deltaPx = e.clientX - drag.initialClientX
      const deltaSec = deltaPx / drag.pxPerSec
      const deltaFrames = Math.round(deltaSec * fps)
      const newFrame = Math.max(0, drag.initialFrame + deltaFrames)
      const c = cutRef.current

      if (drag.edge === 'start') {
        if (newFrame < c.endFrame) {
          onUpdate({ ...c, startFrame: newFrame })
        }
      } else {
        if (newFrame > c.startFrame) {
          onUpdate({ ...c, endFrame: newFrame })
        }
      }
    },
    [fps, onUpdate],
  )

  const onWindowPointerUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
  }, [onWindowPointerMove])

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
      {/* Left (start) drag handle — extends outside the cut region so it's always reachable */}
      <div
        className="absolute top-0 bottom-0 w-3 -left-1.5 cursor-col-resize z-10 flex items-center justify-center group"
        onPointerDown={(e) => startDrag(e, 'start')}
      >
        <div className="h-6 w-1 rounded-full bg-red-400/60 group-hover:bg-red-400 group-active:bg-red-300 transition-colors" />
      </div>
      {/* Right (end) drag handle — extends outside the cut region */}
      <div
        className="absolute top-0 bottom-0 w-3 -right-1.5 cursor-col-resize z-10 flex items-center justify-center group"
        onPointerDown={(e) => startDrag(e, 'end')}
      >
        <div className="h-6 w-1 rounded-full bg-red-400/60 group-hover:bg-red-400 group-active:bg-red-300 transition-colors" />
      </div>
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
