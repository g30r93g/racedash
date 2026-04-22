export interface Lap {
  number: number
  lapTime: number // individual lap duration in seconds
  cumulative: number // sum of all laps up to and including this one
}

export interface LapTimestamp {
  lap: Lap
  ytSeconds: number // seconds from video start to this lap's START
}

export interface SessionData {
  driver: { kart: string; name: string }
  laps: Lap[]
  timestamps: LapTimestamp[]
}

export interface LeaderboardDriver {
  kart: string
  name: string
  timestamps: LapTimestamp[] // absolute ytSeconds for each lap start
}

export interface RaceLapEntry {
  kart: string
  name: string
  position: number
  lapsCompleted: number
  gapToLeader: string // verbatim from wire; reserved for future display use
  intervalToAhead: string // "" for P1, otherwise unsigned decimal e.g. "0.333"
}

export interface RaceLapSnapshot {
  leaderLap: number // 1-based (1 = after leader's first lap)
  videoTimestamp: number // absolute seconds into video when this snapshot activates
  entries: RaceLapEntry[] // ordered P1 → last place
}

export interface PositionOverride {
  timestamp: number
  position: number
}

export type BannerInfoSegmentContent = 'none' | 'last-lap' | 'best-lap'

export type SessionMode = 'practice' | 'qualifying' | 'race'

export type CornerPosition = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
export type BoxPosition = CornerPosition | 'bottom-center' | 'top-center'

export interface SessionSegment {
  mode: SessionMode
  session: SessionData
  sessionAllLaps: Lap[][] // one Lap[] per driver, segment-isolated (no cross-segment data)
  leaderboardDrivers?: LeaderboardDriver[] // populated for all modes; used by PositionCounter (all modes) and LeaderboardTable (qualifying + practice only)
  raceLapSnapshots?: RaceLapSnapshot[]
  label?: string // shown ±labelWindowSeconds around session.timestamps[0].ytSeconds
  positionOverrides?: PositionOverride[]
}

export interface FadeStyling {
  enabled?: boolean // whether to fade in the overlay          (default: true)
  durationSeconds?: number // fade-in duration in seconds             (default: 1)
  fadeOutDurationSeconds?: number // fade-out duration in seconds            (default: 1)
  preRollSeconds?: number // seconds before first timestamp to show  (default: 3)
  postRollSeconds?: number // seconds after last timestamp to hold    (default: 2)
}

export const DEFAULT_FADE_ENABLED = true
export const DEFAULT_FADE_DURATION_SECONDS = 1
export const DEFAULT_FADE_OUT_DURATION_SECONDS = 1
export const DEFAULT_FADE_PRE_ROLL_SECONDS = 3
export const DEFAULT_FADE_POST_ROLL_SECONDS = 2
export const DEFAULT_LABEL_WINDOW_SECONDS = 2

export interface SegmentLabelStyling {
  enabled?: boolean // whether to show segment labels           (default: true)
  bgColor?: string // pill background                         (default: rgba(0,0,0,0.72))
  textColor?: string // text color                              (default: white)
  borderRadius?: number // in reference px                         (default: 8)
  fadeInDurationSeconds?: number // label fade-in duration in seconds       (default: 0.5)
  fadeOutDurationSeconds?: number // label fade-out duration in seconds      (default: 0.5)
  preRollSeconds?: number // seconds before segment start to show    (default: 2)
  postRollSeconds?: number // seconds after segment start to hold     (default: 2)
}

export const DEFAULT_SEGMENT_LABEL_ENABLED = true
export const DEFAULT_SEGMENT_LABEL_FADE_IN_SECONDS = 0.5
export const DEFAULT_SEGMENT_LABEL_FADE_OUT_SECONDS = 0.5
export const DEFAULT_SEGMENT_LABEL_PRE_ROLL_SECONDS = 2
export const DEFAULT_SEGMENT_LABEL_POST_ROLL_SECONDS = 2

export interface MarginConfig {
  top?: number // top margin in reference px     (default: 0)
  right?: number // right margin in reference px   (default: 0)
  bottom?: number // bottom margin in reference px  (default: 0)
  left?: number // left margin in reference px    (default: 0)
}

export interface LapListStyling {
  maxRows?: number | 'all' // max visible rows          (default: 'all')
  bgColor?: string // row background             (default: rgba(0,0,0,0.65))
  textColor?: string // lap number/time text       (default: white)
  bestLapColor?: string // best lap highlight color   (default: #00FF87)
  position?: BoxPosition // screen position            (default: bottom-right)
}

export interface DeltaBadgeStyling {
  fasterColor?: string // color when lap is faster  (default: #00FF87)
  slowerColor?: string // color when lap is slower  (default: #FF3B30)
  fadeInDuration?: number // per-lap fade-in in seconds (default: 0.5)
}

export interface LeaderboardStyling {
  accentColor?: string // P1 highlight & our-row accent         (default: inherits OverlayStyling.accentColor)
  bgColor?: string // default row background                (default: rgba(0,0,0,0.65))
  ourRowBgColor?: string // our-kart row background               (default: rgba(0,0,0,0.82))
  ourRowBorderWidth?: number // our-kart left border width in px      (default: 3)
  ourRowGradientOpacity?: number // our-kart accent gradient opacity 0–1  (default: 0.19)
  backdropBlur?: number // row backdrop blur in px               (default: 8)
  textColor?: string // driver name text                      (default: white)
  positionTextColor?: string // position label (non-P1)               (default: rgba(255,255,255,0.5))
  kartTextColor?: string // kart number column                    (default: rgba(255,255,255,0.7))
  lapTimeTextColor?: string // lap/interval time (non-P1)            (default: rgba(255,255,255,0.8))
  separatorColor?: string // thin line between groups              (default: rgba(255,255,255,0.15))
}

export interface BannerStyling {
  accentColor?: string // accent color for P1, borders   (default: #3DD73D)
  textColor?: string // driver name text color         (default: white)
  margin?: MarginConfig // overlay margin in reference px (default: all 0)
  bgColor?: string // banner background color        (default: inherits accentColor)
  bgOpacity?: number // banner background opacity      (default: 0.82)
  borderRadius?: number // outer border radius in ref px  (default: 10)
  timerTextColor?: string // lap timer text color           (default: white)
  timerBgColor?: string // lap timer background           (default: #111111)
  lapColorPurple?: string // personal best lap flash color  (default: rgba(107,33,168,0.95))
  lapColorGreen?: string // session best lap flash color   (default: rgba(21,128,61,0.95))
  lapColorRed?: string // slower lap flash color         (default: rgba(185,28,28,0.95))
  flashDuration?: number // lap color flash duration in s  (default: 2)
  leftSegment?: BannerInfoSegmentContent // left info segment  (default: last-lap)
  rightSegment?: BannerInfoSegmentContent // right info segment (default: best-lap)
}

export interface GeometricBannerStyling {
  accentColor?: string // accent color                 (default: #3DD73D)
  textColor?: string // text colour                  (default: white)
  margin?: MarginConfig // overlay margin in reference px (default: all 0)
  positionCounterColor?: string // position-counter fill        (default: #0bc770)
  lastLapColor?: string // last-lap fill                (default: #16aa9c)
  lapTimerNeutralColor?: string // lap-timer neutral fill       (default: #0e0ab8)
  previousLapColor?: string // previous-lap fill            (default: #7c16aa)
  lapCounterColor?: string // lap-counter fill             (default: #c70b4d)
  lapColorPurple?: string // personal best flash          (default: rgba(107,33,168,0.95))
  lapColorGreen?: string // session best flash           (default: rgba(21,128,61,0.95))
  lapColorRed?: string // slower lap flash             (default: rgba(185,28,28,0.95))
  timerTextColor?: string // timer text colour            (default: white)
  flashDuration?: number // flash duration in s          (default: 2)
  opacity?: number // background fill opacity      (default: 1)
  leftSegment?: BannerInfoSegmentContent // left info segment    (default: last-lap)
  rightSegment?: BannerInfoSegmentContent // right info segment   (default: best-lap)
}

export interface EsportsStyling {
  margin?: MarginConfig // overlay margin in reference px (default: all 0)
  accentBarColor?: string // accent bar gradient start  (default: #2563eb)
  accentBarColorEnd?: string // accent bar gradient end    (default: #7c3aed)
  timePanelsBgColor?: string // time panels background     (default: #3f4755)
  timePanelTextColor?: string // time panels text          (default: #ffffff)
  currentBarBgColor?: string // current time bar bg        (default: #111)
  currentBarTextColor?: string // current time bar text     (default: #ffffff)
  labelColor?: string // CURRENT label & icon tint  (default: #9ca3af)
  lastLapIconColor?: string // last lap icon background   (default: #16a34a)
  sessionBestIconColor?: string // session best icon bg       (default: #7c3aed)
}

export interface MinimalStyling {
  margin?: MarginConfig // overlay margin in reference px (default: all 0)
  bgColor?: string // card background             (default: rgba(20,22,28,0.88))
  borderRadius?: number // card border radius in ref px (default: 12)
  badgeBgColor?: string // lap counter badge bg        (default: white)
  badgeTextColor?: string // lap counter badge text      (default: #222222)
  elapsedTextColor?: string // lap timer text              (default: #ffffff)
  positionTextColor?: string // position stat text          (default: #ffffff)
  positionLabelColor?: string // position stat label         (default: #aaaaaa)
  lastLapTextColor?: string // last lap stat text          (default: #ffffff)
  lastLapLabelColor?: string // last lap stat label         (default: #aaaaaa)
  sessionBestTextColor?: string // session best stat text     (default: #ffffff)
  sessionBestLabelColor?: string // session best stat label    (default: #aaaaaa)
}

export interface ModernStyling {
  margin?: MarginConfig // overlay margin in reference px (default: all 0)
  bgColor?: string // container background   (default: rgba(13,15,20,0.88))
  stripeOpacity?: number // bg stripe opacity      (default: 0.035)
  dividerColor?: string // vertical divider color (default: rgba(255,255,255,0.2))
  statTextColor?: string // stat value text color (default: #ffffff)
  statLabelColor?: string // stat label color       (default: rgba(255,255,255,0.5))
}

export type ComponentToggle = 'off' | 'on' | boolean

export interface OverlayComponentsConfig {
  leaderboard?: ComponentToggle
  positionCounter?: ComponentToggle
  lapCounter?: ComponentToggle
  lapTimer?: ComponentToggle
  deltaBadge?: ComponentToggle
  lapList?: ComponentToggle
  position?: ComponentToggle
  lastLap?: ComponentToggle
  sessionBest?: ComponentToggle
}

export function isOverlayComponentEnabled(value: ComponentToggle | undefined): boolean {
  return value === 'on' || value === true
}

export interface OverlayStyling {
  fade?: FadeStyling
  segmentLabel?: SegmentLabelStyling
  deltaBadge?: DeltaBadgeStyling
  lapList?: LapListStyling
  leaderboard?: LeaderboardStyling
  banner?: BannerStyling
  geometricBanner?: GeometricBannerStyling
  esports?: EsportsStyling
  minimal?: MinimalStyling
  modern?: ModernStyling
}

export interface OverlayProps {
  segments: SessionSegment[]
  startingGridPosition?: number // race only: grid position at race start
  fps: number
  durationInFrames: number
  videoWidth?: number
  videoHeight?: number
  boxPosition?: BoxPosition
  qualifyingTablePosition?: CornerPosition // corner for the qualifying table overlay; default varies by style
  overlayComponents?: OverlayComponentsConfig
  styling?: OverlayStyling
  labelWindowSeconds?: number // default 2
}

export interface LapOverlayProps extends OverlayProps {
  targetLapNumber: number
  targetLapStartFrame: number
  targetLapEndFrame: number
}
