'use client'

import { useEffect, useState } from 'react'

// A cheeky chronograph in-joke: a tiny mono timer that counts up from the
// moment the page loaded. Lives in the header as a brand detail. Updates every
// 100ms so the tenths place ticks visibly without being expensive.
export function SessionTimer() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = () => {
      setElapsed(performance.now() - start)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <span className="font-mono text-foreground-dim hidden text-[11px] tabular-nums md:inline-block">
      {format(elapsed)}
    </span>
  )
}

function format(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((ms % 1000) / 100)
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
