import { useState, useEffect } from 'react'
import { spinners, SpinnerName } from './spinners'

function getReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useSpinner(
  name: SpinnerName,
  speed: number = 1,
  paused: boolean = false,
  ignoreReducedMotion: boolean = false,
): string {
  const def = spinners[name]
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!ignoreReducedMotion && getReducedMotion()) return
    if (paused) return

    setFrame(0)
    const ms = def.interval / Math.max(speed, 0.01)
    const id = setInterval(() => {
      setFrame((prev) => (prev + 1) % def.frames.length)
    }, ms)
    return () => clearInterval(id)
  }, [name, speed, paused, ignoreReducedMotion, def.interval, def.frames.length])

  return def.frames[frame] ?? def.frames[0]
}
