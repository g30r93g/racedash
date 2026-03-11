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

export interface LeaderboardDriver {
  kart: string
  name: string
  timestamps: LapTimestamp[]   // absolute ytSeconds for each lap start
}

export interface RaceLapEntry {
  kart: string
  name: string
  position: number
  lapsCompleted: number
  gapToLeader: string      // verbatim from wire; reserved for future display use
  intervalToAhead: string  // "" for P1, otherwise unsigned decimal e.g. "0.333"
}

export interface RaceLapSnapshot {
  leaderLap: number        // 1-based (1 = after leader's first lap)
  videoTimestamp: number   // absolute seconds into video when this snapshot activates
  entries: RaceLapEntry[]  // ordered P1 → last place
}

export type SessionMode = 'practice' | 'qualifying' | 'race'

export type BoxPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'

export interface SessionSegment {
  mode: SessionMode
  session: SessionData
  sessionAllLaps: Lap[][]   // one Lap[] per driver, segment-isolated (no cross-segment data)
  leaderboardDrivers?: LeaderboardDriver[]  // populated for all modes; used by PositionCounter (all modes) and LeaderboardTable (qualifying + practice only)
  raceLapSnapshots?: RaceLapSnapshot[]
  label?: string            // shown ±labelWindowSeconds around session.timestamps[0].ytSeconds
}

export interface LeaderboardStyling {
  bgColor?: string           // default row background      (default: rgba(0,0,0,0.65))
  ourRowBgColor?: string     // our-kart row background     (default: rgba(0,0,0,0.82))
  textColor?: string         // driver name text            (default: white)
  positionTextColor?: string // position label (non-P1)     (default: rgba(255,255,255,0.5))
  kartTextColor?: string     // kart number column          (default: rgba(255,255,255,0.7))
  lapTimeTextColor?: string  // lap/interval time (non-P1)  (default: rgba(255,255,255,0.8))
  separatorColor?: string    // thin line between groups    (default: rgba(255,255,255,0.15))
}

export interface BannerStyling {
  timerTextColor?: string  // lap timer text color   (default: white)
  timerBgColor?: string    // lap timer background   (default: #111111)
}

export interface OverlayStyling {
  accentColor?: string       // global accent         (default: #3DD73D)
  textColor?: string         // global text color     (default: white)
  leaderboard?: LeaderboardStyling
  banner?: BannerStyling
}

export interface OverlayProps {
  segments: SessionSegment[]
  startingGridPosition?: number   // race only: grid position at race start
  fps: number
  durationInFrames: number
  videoWidth?: number
  videoHeight?: number
  boxPosition?: BoxPosition
  qualifyingTablePosition?: BoxPosition  // corner for the qualifying table overlay; default varies by style
  styling?: OverlayStyling
  labelWindowSeconds?: number     // default 5
}
