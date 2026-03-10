export interface Lap {
  number: number
  lapTime: number      // individual lap duration in seconds
  cumulative: number   // sum of all laps up to and including this one
}

export interface LapTimestamp {
  lap: Lap
  ytSeconds: number    // seconds from video start to this lap's START
}

export interface SessionData {
  driver: { kart: string; name: string }
  laps: Lap[]
  timestamps: LapTimestamp[]
}

export type SessionMode = 'practice' | 'qualifying' | 'race'

export type BoxPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'

export interface SessionSegment {
  mode: SessionMode
  session: SessionData
  sessionAllLaps: Lap[][]   // one Lap[] per driver; segment-isolated (no cross-segment data)
  label?: string            // shown ±labelWindowSeconds around this segment's offset
}

export interface OverlayProps {
  segments: SessionSegment[]
  startingGridPosition?: number   // race only: grid position at race start
  fps: number
  durationInFrames: number
  videoWidth?: number
  videoHeight?: number
  boxPosition?: BoxPosition
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
  labelWindowSeconds?: number     // default 5
}
