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
  resolveSegmentPositionOverrides,
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
  CachedSegmentConfig,
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
  RenderJobType,
  RenderJobOpts,
  BatchRenderOpts,
  BatchJobProgressEvent,
  BatchJobResult,
  PrecomputedContext,
} from './types'

export {
  getRenderExperimentalWarning,
  runDoctor,
  joinVideos,
  listDrivers,
  generateTimestamps,
} from './operations'

export {
  renderBatch,
  buildPrecomputedContext,
  rebaseSegment,
  computeClipRange,
  resolveSourceFiles,
} from './batch'

export type { FileFrameRange } from './batch'

// Re-export compositor utilities so CLI and desktop can use them
// without taking a direct dependency on @racedash/compositor
export { getOverlayRenderProfile, parseFpsValue } from '@racedash/compositor'
