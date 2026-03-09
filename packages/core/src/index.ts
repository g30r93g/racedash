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

export interface OverlayProps {
  session: SessionData
  sessionAllLaps: Lap[][]   // one Lap[] per driver, used for session-best comparison
  fps: number
  durationInFrames: number
}
