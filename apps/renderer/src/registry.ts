import type { ComponentType } from 'react'
import type { BoxPosition, OverlayProps } from '@racedash/core'
import { Banner } from './styles/banner'
import { Esports } from './styles/esports'
import { GeometricBanner } from './styles/geometric-banner'
import { Minimal } from './styles/minimal'
import { Modern } from './styles/modern'

// ── Setting declaration types ────────────────────────────────────────────────

export type SettingType = 'colour' | 'dropdown' | 'stepper' | 'group'

export interface ComponentSetting {
  key: string
  label: string
  type: SettingType
  default: string | number
  /** For dropdown type only. */
  options?: Array<{ value: string; label: string }>
  /** For group type only — nested settings rendered inside a collapsible. */
  children?: ComponentSetting[]
  /** For group type only — the stylingPath for child settings. */
  childStylingPath?: string
}

export interface StyleComponentDef {
  /** Maps to OverlayComponentsConfig key for toggleable components. */
  key: string
  label: string
  toggleable: boolean
  settings: ComponentSetting[]
  /** Dot-path prefix for reading/writing in OverlayStyling (e.g. 'banner'). */
  stylingPath: string
}

export interface StyleSettingDef extends ComponentSetting {
  /** Full dot-path in OverlayStyling (e.g. 'banner.bgColor'). */
  stylingPath: string
}

// ── Registry entry ───────────────────────────────────────────────────────────

export interface RegistryEntry {
  /** Human-readable display name for the overlay style. */
  name: string
  component: ComponentType<OverlayProps>
  width: number
  height: number
  overlayX: number
  overlayY: number
  scaleWithVideo?: boolean
  styleSettings?: StyleSettingDef[]
  components?: StyleComponentDef[]
}

// ── Position options ─────────────────────────────────────────────────────────

export const BOX_POSITION_OPTIONS: Array<{ value: BoxPosition; label: string }> = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-center', label: 'Bottom Centre' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-center', label: 'Top Centre' },
  { value: 'top-right', label: 'Top Right' },
]

// ── Global components (style-agnostic, always shown) ─────────────────────────

// ── Shared style settings (appended to every style's styleSettings) ──────────

export const FADE_SETTING: StyleSettingDef = {
  key: 'fade',
  label: 'Fade',
  type: 'group',
  default: '',
  stylingPath: 'fade',
  childStylingPath: 'fade',
  children: [
    { key: 'preRollSeconds', label: 'Pre-roll', type: 'stepper', default: 3 },
    { key: 'durationSeconds', label: 'Fade in', type: 'stepper', default: 1 },
    { key: 'fadeOutDurationSeconds', label: 'Fade out', type: 'stepper', default: 1 },
    { key: 'postRollSeconds', label: 'Post-roll', type: 'stepper', default: 2 },
  ],
}

export const globalComponents: StyleComponentDef[] = [
  {
    key: 'segmentLabel',
    label: 'Session Label',
    toggleable: true,
    stylingPath: 'segmentLabel',
    settings: [
      { key: 'preRollSeconds', label: 'Pre-roll', type: 'stepper', default: 2 },
      { key: 'fadeInDurationSeconds', label: 'Fade in', type: 'stepper', default: 0.5 },
      { key: 'fadeOutDurationSeconds', label: 'Fade out', type: 'stepper', default: 0.5 },
      { key: 'postRollSeconds', label: 'Post-roll', type: 'stepper', default: 2 },
    ],
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    toggleable: true,
    stylingPath: 'leaderboard',
    settings: [
      { key: 'bgColor', label: 'Row background', type: 'colour', default: 'rgba(0,0,0,0.65)' },
      { key: 'ourRowBgColor', label: 'Driver row', type: 'colour', default: 'rgba(0,0,0,0.82)' },
      { key: 'textColor', label: 'Driver name', type: 'colour', default: '#ffffff' },
      { key: 'positionTextColor', label: 'Position', type: 'colour', default: 'rgba(255,255,255,0.5)' },
      { key: 'kartTextColor', label: 'Kart number', type: 'colour', default: 'rgba(255,255,255,0.7)' },
      { key: 'lapTimeTextColor', label: 'Lap time', type: 'colour', default: 'rgba(255,255,255,0.8)' },
      { key: 'separatorColor', label: 'Separator', type: 'colour', default: 'rgba(255,255,255,0.15)' },
    ],
  },
  {
    key: 'lapList',
    label: 'Lap List',
    toggleable: true,
    stylingPath: 'lapList',
    settings: [
      { key: 'bgColor', label: 'Background', type: 'colour', default: 'rgba(0,0,0,0.65)' },
      { key: 'textColor', label: 'Text colour', type: 'colour', default: '#ffffff' },
      { key: 'bestLapColor', label: 'Best lap', type: 'colour', default: '#00FF87' },
    ],
  },
]

// ── Shared constants ─────────────────────────────────────────────────────────

const INFO_PANEL_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'last-lap', label: 'Last Lap' },
  { value: 'best-lap', label: 'Best Lap' },
]

const BANNER_FLASH_SETTINGS: ComponentSetting[] = [
  { key: 'timerTextColor', label: 'Timer text', type: 'colour', default: '#ffffff' },
  { key: 'timerBgColor', label: 'Timer bg', type: 'colour', default: '#111111' },
  { key: 'lapColorPurple', label: 'PB flash', type: 'colour', default: 'rgba(107,33,168,0.95)' },
  { key: 'lapColorGreen', label: 'SB flash', type: 'colour', default: 'rgba(21,128,61,0.95)' },
  { key: 'lapColorRed', label: 'Slower flash', type: 'colour', default: 'rgba(185,28,28,0.95)' },
]

// ── Registry ─────────────────────────────────────────────────────────────────

export const registry: Record<string, RegistryEntry> = {
  banner: {
    name: 'Banner',
    component: Banner,
    width: 1920,
    height: 500,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
    styleSettings: [
      { key: 'accentColor', label: 'Accent', type: 'colour', default: '#3DD73D', stylingPath: 'banner' },
      { key: 'textColor', label: 'Text', type: 'colour', default: '#ffffff', stylingPath: 'banner' },
      { key: 'bgColor', label: 'Background', type: 'colour', default: '#3DD73D', stylingPath: 'banner' },
      { key: 'borderRadius', label: 'Border radius', type: 'stepper', default: 10, stylingPath: 'banner' },
      FADE_SETTING,
    ],
    components: [
      { key: 'positionCounter', label: 'Position Counter', toggleable: true, settings: [], stylingPath: 'banner' },
      { key: 'lapTimer', label: 'Lap Timer', toggleable: true, stylingPath: 'banner', settings: BANNER_FLASH_SETTINGS },
      { key: 'lapCounter', label: 'Lap Counter', toggleable: true, settings: [], stylingPath: 'banner' },
      {
        key: 'infoPanels', label: 'Info Panels', toggleable: false, stylingPath: 'banner', settings: [
          { key: 'leftSegment', label: 'Left segment', type: 'dropdown', default: 'last-lap', options: INFO_PANEL_OPTIONS },
          { key: 'rightSegment', label: 'Right segment', type: 'dropdown', default: 'best-lap', options: INFO_PANEL_OPTIONS },
        ],
      },
    ],
  },
  'geometric-banner': {
    name: 'Geometric Banner',
    component: GeometricBanner,
    width: 1920,
    height: 500,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
    styleSettings: [
      { key: 'accentColor', label: 'Accent', type: 'colour', default: '#3DD73D', stylingPath: 'geometricBanner' },
      { key: 'textColor', label: 'Text', type: 'colour', default: '#ffffff', stylingPath: 'geometricBanner' },
      FADE_SETTING,
    ],
    components: [
      { key: 'positionCounter', label: 'Position Counter', toggleable: true, stylingPath: 'geometricBanner', settings: [
        { key: 'positionCounterColor', label: 'Fill colour', type: 'colour', default: '#0bc770' },
      ]},
      { key: 'lapTimer', label: 'Lap Timer', toggleable: true, stylingPath: 'geometricBanner', settings: [
        { key: 'lapTimerNeutralColor', label: 'Neutral colour', type: 'colour', default: '#0e0ab8' },
        { key: 'timerTextColor', label: 'Timer text', type: 'colour', default: '#ffffff' },
        { key: 'lapColorPurple', label: 'PB flash', type: 'colour', default: 'rgba(107,33,168,0.95)' },
        { key: 'lapColorGreen', label: 'SB flash', type: 'colour', default: 'rgba(21,128,61,0.95)' },
        { key: 'lapColorRed', label: 'Slower flash', type: 'colour', default: 'rgba(185,28,28,0.95)' },
      ]},
      { key: 'lapCounter', label: 'Lap Counter', toggleable: true, stylingPath: 'geometricBanner', settings: [
        { key: 'lapCounterColor', label: 'Fill colour', type: 'colour', default: '#c70b4d' },
      ]},
      { key: 'lastLap', label: 'Last Lap Indicator', toggleable: false, stylingPath: 'geometricBanner', settings: [
        { key: 'lastLapColor', label: 'Fill colour', type: 'colour', default: '#16aa9c' },
      ]},
      { key: 'previousLap', label: 'Previous Lap Indicator', toggleable: false, stylingPath: 'geometricBanner', settings: [
        { key: 'previousLapColor', label: 'Fill colour', type: 'colour', default: '#7c16aa' },
      ]},
    ],
  },
  esports: {
    name: 'Esports',
    component: Esports,
    width: 1920,
    height: 400,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
    styleSettings: [FADE_SETTING],
    components: [
      { key: 'accentBar', label: 'Accent Bar', toggleable: false, stylingPath: 'esports', settings: [
        { key: 'accentBarColor', label: 'Gradient start', type: 'colour', default: '#2563eb' },
        { key: 'accentBarColorEnd', label: 'Gradient end', type: 'colour', default: '#7c3aed' },
      ]},
      { key: 'timePanels', label: 'Time Panels', toggleable: false, stylingPath: 'esports', settings: [
        { key: 'timePanelsBgColor', label: 'Background', type: 'colour', default: '#3f4755' },
        { key: 'labelColor', label: 'Label colour', type: 'colour', default: '#9ca3af' },
      ]},
      { key: 'currentBar', label: 'Current Time Bar', toggleable: false, stylingPath: 'esports', settings: [
        { key: 'currentBarBgColor', label: 'Background', type: 'colour', default: '#111111' },
      ]},
      { key: 'lastLapIcon', label: 'Last Lap Icon', toggleable: false, stylingPath: 'esports', settings: [
        { key: 'lastLapIconColor', label: 'Colour', type: 'colour', default: '#16a34a' },
      ]},
      { key: 'sessionBestIcon', label: 'Session Best Icon', toggleable: false, stylingPath: 'esports', settings: [
        { key: 'sessionBestIconColor', label: 'Colour', type: 'colour', default: '#7c3aed' },
      ]},
    ],
  },
  minimal: {
    name: 'Minimal',
    component: Minimal,
    width: 1920,
    height: 400,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
    styleSettings: [
      { key: 'bgColor', label: 'Background', type: 'colour', default: 'rgba(20,22,28,0.88)', stylingPath: 'minimal' },
      FADE_SETTING,
    ],
    components: [
      { key: 'lapBadge', label: 'Lap Badge', toggleable: false, stylingPath: 'minimal', settings: [
        { key: 'badgeBgColor', label: 'Background', type: 'colour', default: '#ffffff' },
        { key: 'badgeTextColor', label: 'Text', type: 'colour', default: '#222222' },
      ]},
      { key: 'stats', label: 'Stats', toggleable: false, stylingPath: 'minimal', settings: [
        { key: 'statLabelColor', label: 'Label colour', type: 'colour', default: '#aaaaaa' },
      ]},
    ],
  },
  modern: {
    name: 'Modern',
    component: Modern,
    width: 1920,
    height: 1080,
    overlayX: 0,
    overlayY: 0,
    scaleWithVideo: true,
    styleSettings: [
      { key: 'bgColor', label: 'Background', type: 'colour', default: 'rgba(13,15,20,0.88)', stylingPath: 'modern' },
      FADE_SETTING,
    ],
    components: [
      { key: 'divider', label: 'Divider', toggleable: false, stylingPath: 'modern', settings: [
        { key: 'dividerColor', label: 'Colour', type: 'colour', default: 'rgba(255,255,255,0.2)' },
      ]},
      { key: 'stats', label: 'Stats', toggleable: false, stylingPath: 'modern', settings: [
        { key: 'statLabelColor', label: 'Label colour', type: 'colour', default: 'rgba(255,255,255,0.5)' },
      ]},
    ],
  },
}
