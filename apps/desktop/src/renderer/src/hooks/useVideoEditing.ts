import { useMemo, useCallback } from 'react'
import type { CutRegion, Transition, Boundary, KeptRange } from '../../../../types/videoEditing'
import type { OverlayStyling } from '@racedash/core'
import {
  computeKeptRanges,
  toOutputFrame,
  toSourceFrame,
  deriveSegmentBuffers,
  computeBoundaries,
  reconcileTransitions,
} from '../lib/videoEditing'

export function useKeptRanges(cutRegions: CutRegion[], totalFrames: number): KeptRange[] {
  return useMemo(() => computeKeptRanges(totalFrames, cutRegions), [cutRegions, totalFrames])
}

export function useSegmentBuffers(
  styling: OverlayStyling | undefined,
  fps: number,
): { preRollFrames: number; postRollFrames: number } {
  return useMemo(() => deriveSegmentBuffers(styling, fps), [styling, fps])
}

export function useBoundaries(
  totalFrames: number,
  cuts: CutRegion[],
  fps: number,
): Boundary[] {
  return useMemo(() => computeBoundaries(totalFrames, cuts, fps), [totalFrames, cuts, fps])
}

export function useFrameMapping(
  cuts: CutRegion[],
  transitions: Transition[],
  fps: number,
): {
  toOutput: (sourceFrame: number) => number
  toSource: (outputFrame: number) => number
} {
  const toOutput = useCallback(
    (sourceFrame: number) => toOutputFrame(sourceFrame, cuts, transitions, fps),
    [cuts, transitions, fps],
  )
  const toSource = useCallback(
    (outputFrame: number) => toSourceFrame(outputFrame, cuts, transitions, fps),
    [cuts, transitions, fps],
  )
  return useMemo(() => ({ toOutput, toSource }), [toOutput, toSource])
}

export function useReconciledTransitions(
  transitions: Transition[],
  boundaries: Boundary[],
): { kept: Transition[]; removed: Transition[] } {
  return useMemo(() => reconcileTransitions(transitions, boundaries), [transitions, boundaries])
}
