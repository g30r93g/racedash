export interface CutRegion {
  id: string
  startFrame: number  // inclusive, global frame in joined source video
  endFrame: number    // exclusive
}

export type TransitionType = 'fadeFromBlack' | 'fadeToBlack' | 'fadeThroughBlack' | 'crossfade'

export interface Transition {
  id: string
  boundaryId: string  // "start" | "end" | "cut:<cutId>" | "segment:<idA>:<idB>"
  type: TransitionType
  durationMs: number  // default 500, snapped to whole frames at render time
}

export type BoundaryKind = 'projectStart' | 'projectEnd' | 'cut' | 'segment'

export interface Boundary {
  id: string
  kind: BoundaryKind
  frameInSource: number
  oneSided: boolean
  label: string
  allowedTypes: TransitionType[]
}

export interface KeptRange {
  startFrame: number  // inclusive, source frames
  endFrame: number    // exclusive, source frames
}

export interface DerivedSegmentBuffers {
  segmentLabel: string
  segmentId: string
  preRollFrames: number
  postRollFrames: number
}
