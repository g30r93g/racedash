export type TimingSource =
  | 'alpha-timing'
  | 'speedhive'
  | 'daytona'
  | 'teamsport'
  | 'manual'

export interface SegmentConfig {
  label: string
  source: TimingSource
  resultsUrl?: string        // alpha-timing
  eventId?: string           // speedhive
  session?: string           // speedhive
  resultsFilePath?: string   // daytona, teamsport
  sessionName?: string       // speedhive, daytona, teamsport
  videoOffsetFrame?: number  // all sources
}

export interface ProjectData {
  name: string
  projectPath: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
}

export interface CreateProjectOpts {
  name: string
  videoPaths: string[]
  segments: SegmentConfig[]
  selectedDriver: string
}
