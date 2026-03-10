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

export interface QualifyingDriver {
  kart: string
  name: string
  timestamps: LapTimestamp[]   // absolute ytSeconds for each lap start
}

export type SessionMode = 'practice' | 'qualifying' | 'race'

export type BoxPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'

export interface SessionSegment {
  mode: SessionMode
  session: SessionData
  sessionAllLaps: Lap[][]   // one Lap[] per driver, segment-isolated (no cross-segment data)
  qualifyingDrivers?: QualifyingDriver[]  // all drivers; populated for qualifying + practice
  label?: string            // shown ±labelWindowSeconds around session.timestamps[0].ytSeconds
}

export interface OverlayProps {
  segments: SessionSegment[]
  startingGridPosition?: number   // race only: grid position at race start
  fps: number
  durationInFrames: number
  videoWidth?: number
  videoHeight?: number
  boxPosition?: BoxPosition
  accentColor?: string    // hex/CSS color for style accent (e.g. banner green band)
  textColor?: string      // hex/CSS color for overlay text (default: white)
  timerTextColor?: string // hex/CSS color for the lap timer text (default: white)
  timerBgColor?: string   // hex/CSS color for the lap timer background (default: #111111)
  labelWindowSeconds?: number     // default 5
}
