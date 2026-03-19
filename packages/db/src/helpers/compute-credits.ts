export interface ComputeCreditsInput {
  width: number
  height: number
  fps: number
  durationSec: number
}

export function computeCredits({ width, fps, durationSec }: ComputeCreditsInput): number {
  const durationMin = durationSec / 60
  const resFactor = width >= 3840 ? 3.0 : 1.0
  const fpsFactor = fps >= 120 ? 1.75 : 1.0
  return Math.ceil(durationMin * resFactor * fpsFactor)
}
