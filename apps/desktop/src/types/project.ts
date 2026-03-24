// Wizard-selectable timing sources. The engine also supports 'cached' (produced at
// save time by cacheRemoteTimingData), but it is not user-selectable.
export type TimingSource =
  | 'alphaTiming'
  | 'mylapsSpeedhive'
  | 'daytonaEmail'
  | 'teamsportEmail'
  | 'manual'

// SessionMode mirrors @racedash/core — kept in sync manually.
export type SessionMode = 'practice' | 'qualifying' | 'race'

/**
 * Wizard-collected segment data. Field names align with the engine's config schema
 * where possible. The `createProject` IPC handler transforms this into the engine's
 * discriminated SegmentConfig when writing project.json.
 *
 * Fields specific to the desktop wizard (not in engine schema):
 * - videoOffsetFrame: the raw frame number picked in the offset picker; converted
 *   to an `offset` timestamp string by createProject using the video's fps.
 * - eventId, session, sessionName: SpeedHive wizard form fields; createProject
 *   constructs the `url` from these before saving.
 */
export interface SegmentConfig {
  label: string
  source: TimingSource
  // alpha-timing, speedhive: results URL
  url?: string
  // speedhive wizard form fields (used to construct `url` on save)
  eventId?: string
  session?: SessionMode
  sessionName?: string
  // daytona, teamsport: path to .eml/.txt file
  emailPath?: string
  // all sources: frame number in the joined video where this segment starts
  videoOffsetFrame?: number
}

export interface ProjectData {
  name: string
  projectPath: string
  /** Path to the engine timing config (config.json) in the project directory. */
  configPath: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
  /** Runtime-only flag set by listProjectsHandler when the project.json cannot be found on disk. Never written to disk. */
  missing?: true
}

export interface CreateProjectOpts {
  name: string
  /** Absolute path to the joined video file (temp or original if single file). */
  joinedVideoPath: string
  segments: SegmentConfig[]
  selectedDriver: string
  /** Exact directory to save the project into. Defaults to ~/Videos/racedash/{slug}. */
  saveDir?: string
}
