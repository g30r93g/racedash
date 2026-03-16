export {
  buildRaceLapSnapshots,
  buildSessionSegments,
  driverListsAreIdentical,
  filterDriverHighlights,
  flattenTimestamps,
  formatDriverDisplay,
  getDriversForDisplay,
  loadTimingConfig,
  resolveDriversCommandSegments,
  resolvePositionOverrides,
  resolveTimingSegments,
  validateManualTimingData,
  validatePositionOverrideConfig,
  TIMING_FEATURES,
  extractSpeedhiveSessionId,
  parseTeamsportEmailBody,
  parseDaytonaEmailBody,
  readBestEmlBody,
} from './timingSources'

export type {
  TimingSource,
  SegmentConfig,
  AlphaTimingSegmentConfig,
  TeamSportEmailSegmentConfig,
  DaytonaEmailSegmentConfig,
  MylapsSpeedhiveSegmentConfig,
  ManualSegmentConfig,
  BaseSegmentConfig,
  TimingConfig,
  LoadedTimingConfig,
  TimingCapabilities,
  ResolvedTimingSegment,
  DriversCommandSegment,
  PositionOverrideConfig,
  ManualTimingEntry,
} from './timingSources'

export type {
  DriversOptions,
  DriversResult,
  TimestampsOptions,
  TimestampsResult,
  RenderOptions,
  RenderProgressEvent,
  RenderResult,
} from './types'

export {
  getRenderExperimentalWarning,
  runDoctor,
  joinVideos,
  listDrivers,
  generateTimestamps,
  renderSession,
} from './operations'

// Re-export compositor utilities so CLI and desktop can use them
// without taking a direct dependency on @racedash/compositor
export { getOverlayRenderProfile, parseFpsValue } from '@racedash/compositor'
