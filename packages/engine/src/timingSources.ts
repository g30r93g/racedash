import * as cheerio from 'cheerio'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type {
  Lap,
  LapTimestamp,
  LeaderboardDriver,
  OverlayComponentsConfig,
  OverlayStyling,
  PositionOverride,
  RaceLapEntry,
  RaceLapSnapshot,
  SessionData,
  SessionMode,
  SessionSegment,
} from '@racedash/core'
import {
  fetchGridHtml,
  fetchHtml,
  fetchReplayHtml,
  parseDrivers,
  parseGrid,
  parseReplayLapData,
} from '@racedash/scraper'
import type { DriverRow, GridEntry, ReplayLapData } from '@racedash/scraper'
import { parseOffset } from '@racedash/timestamps'

export type TimingSource = 'alphaTiming' | 'teamsportEmail' | 'daytonaEmail' | 'mylapsSpeedhive' | 'manual' | 'cached'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

export interface PositionOverrideConfig {
  timestamp: string
  position: number
}

export interface ManualTimingEntry {
  lap: number
  time: string
  position?: number
}

export interface BaseSegmentConfig {
  source: TimingSource
  mode: SessionMode
  offset: string
  label?: string
  driver?: string
  positionOverrides?: PositionOverrideConfig[]
}

export interface AlphaTimingSegmentConfig extends BaseSegmentConfig {
  source: 'alphaTiming'
  url: string
}

export interface TeamSportEmailSegmentConfig extends BaseSegmentConfig {
  source: 'teamsportEmail'
  emailPath: string
}

export interface DaytonaEmailSegmentConfig extends BaseSegmentConfig {
  source: 'daytonaEmail'
  emailPath: string
}

export interface MylapsSpeedhiveSegmentConfig extends BaseSegmentConfig {
  source: 'mylapsSpeedhive'
  url: string
}

export interface ManualSegmentConfig extends BaseSegmentConfig {
  source: 'manual'
  timingData: ManualTimingEntry[]
}

export interface CachedSegmentConfig extends BaseSegmentConfig {
  source: 'cached'
  originalSource: Exclude<TimingSource, 'cached'>
  drivers: DriverRow[]
  capabilities: TimingCapabilities
  startingGrid?: GridEntry[]
  replayData?: ReplayLapData
}

export type SegmentConfig =
  | AlphaTimingSegmentConfig
  | TeamSportEmailSegmentConfig
  | DaytonaEmailSegmentConfig
  | MylapsSpeedhiveSegmentConfig
  | ManualSegmentConfig
  | CachedSegmentConfig

export interface TimingConfig {
  segments: JsonObject[]
  boxPosition?: string
  qualifyingTablePosition?: string
  overlayComponents?: OverlayComponentsConfig
  styling?: OverlayStyling
}

export interface LoadedTimingConfig {
  segments: SegmentConfig[]
  configBoxPosition?: string
  configTablePosition?: string
  overlayComponents?: OverlayComponentsConfig
  styling?: OverlayStyling
}

export interface TimingCapabilities {
  driverDiscovery: boolean
  lapTimes: boolean
  bestLap: boolean
  lastLap: boolean
  position: boolean
  classificationPosition: boolean
  leaderboard: boolean
  gapToLeader: boolean
  gapToKartAhead: boolean
  gapToKartBehind: boolean
  startingGrid: boolean
  raceSnapshots: boolean
}

export interface ResolvedTimingSegment {
  config: SegmentConfig
  drivers: DriverRow[]
  selectedDriver?: DriverRow
  capabilities: TimingCapabilities
  startingGrid?: GridEntry[]
  replayData?: ReplayLapData
}

export interface DriversCommandSegment {
  config: SegmentConfig
  capabilities: TimingCapabilities
  drivers: DriverRow[]
  selectedDriver?: DriverRow
}

interface DaytonaSessionResponse {
  id: number
  eventId: number
  name: string
  type: string
}

interface DaytonaClassificationGap {
  lapsBehind: number
  timeDifference: string
}

interface DaytonaClassificationRow {
  name: string
  startNumber: string
  position: number
  positionInClass: number
  bestTime: string
  bestLap: number
  numberOfLaps: number
  gap?: DaytonaClassificationGap
  difference?: DaytonaClassificationGap
}

interface DaytonaClassificationResponse {
  type: string
  rows: DaytonaClassificationRow[]
}

interface DaytonaLapchartPosition {
  position: number
  startNumber: string
  inLeaderLap: boolean
}

interface DaytonaLapchartStartPosition {
  name: string
  startNumber: string
}

interface DaytonaLapchartResponse {
  id: number
  startPositions?: DaytonaLapchartStartPosition[]
  positionRows?: DaytonaLapchartPosition[][]
}

interface DaytonaParticipantInfo {
  name: string
  class: string
  startNr: string
  startPos: number
  fieldFinishPos: number
  classFinishPos: number
}

interface DaytonaFieldComparison {
  position: number
  leaderLap: number
  diff: string | null
  gapAhead: string | null
  gapBehind: string | null
}

interface DaytonaLapDataLap {
  lapNr: number
  timeOfDay: string
  lapTime: string
  fieldComparison?: DaytonaFieldComparison
}

interface DaytonaLapDataResponse {
  lapDataInfo: {
    participantInfo: DaytonaParticipantInfo
    lapCount: number
  } | null
  laps: DaytonaLapDataLap[]
}

interface TeamsportParsedEmail {
  drivers: DriverRow[]
}

interface DaytonaParsedEmail {
  drivers: DriverRow[]
  selectedDriver: DriverRow
}

export const TIMING_FEATURES: Array<{ key: keyof TimingCapabilities; label: string }> = [
  { key: 'driverDiscovery', label: 'driver discovery' },
  { key: 'lapTimes', label: 'lap times' },
  { key: 'bestLap', label: 'best lap' },
  { key: 'lastLap', label: 'last lap' },
  { key: 'position', label: 'position' },
  { key: 'classificationPosition', label: 'position in classification' },
  { key: 'leaderboard', label: 'leaderboard' },
  { key: 'gapToLeader', label: 'gap to leader' },
  { key: 'gapToKartAhead', label: 'gap to kart ahead' },
  { key: 'gapToKartBehind', label: 'gap to kart behind' },
  { key: 'startingGrid', label: 'starting grid' },
  { key: 'raceSnapshots', label: 'race snapshots' },
]

const DAYTONA_API_BASE = 'https://eventresults-api.speedhive.com/api/v0.2.3/eventresults'

export function buildRaceLapSnapshots(replayData: ReplayLapData, offsetSeconds: number): RaceLapSnapshot[] {
  const result: RaceLapSnapshot[] = []
  for (let i = 1; i < replayData.length; i++) {
    const snapshot = replayData[i]
    const p1 = snapshot.find((entry) => entry.position === 1)
    if (!p1 || p1.totalSeconds === null) continue
    const videoTimestamp = offsetSeconds + p1.totalSeconds
    const entries: RaceLapEntry[] = snapshot.map((entry) => ({
      kart: entry.kart,
      name: entry.name,
      position: entry.position,
      lapsCompleted: entry.lapsCompleted,
      gapToLeader: entry.gapToLeader,
      intervalToAhead: entry.intervalToAhead,
    }))
    result.push({ leaderLap: i, videoTimestamp, entries })
  }
  return result
}

export function validatePositionOverrideConfig(
  positionOverrides: JsonValue | undefined,
  mode: string,
  segmentIndex: number,
): PositionOverrideConfig[] | undefined {
  if (positionOverrides === undefined) return undefined
  if (!Array.isArray(positionOverrides)) {
    throw new Error(`segments[${segmentIndex}].positionOverrides must be an array`)
  }
  if (positionOverrides.length === 0) return []

  if (mode.toLowerCase() !== 'race') {
    throw new Error(`segments[${segmentIndex}].positionOverrides is only valid for race segments`)
  }

  return positionOverrides.map((entry, entryIndex) => {
    if (entry == null || typeof entry !== 'object') {
      throw new Error(`segments[${segmentIndex}].positionOverrides[${entryIndex}] must be an object`)
    }

    const timestamp = (entry as JsonObject).timestamp
    const positionValue = (entry as JsonObject).position
    if (typeof timestamp !== 'string' || !timestamp) {
      throw new Error(`segments[${segmentIndex}].positionOverrides[${entryIndex}] is missing "timestamp"`)
    }
    if (typeof positionValue !== 'number' || !Number.isInteger(positionValue) || positionValue < 1) {
      throw new Error(`segments[${segmentIndex}].positionOverrides[${entryIndex}].position must be an integer >= 1`)
    }

    return { timestamp, position: positionValue }
  })
}

export function resolvePositionOverrides(
  positionOverrides: PositionOverrideConfig[] | undefined,
  offsetSeconds: number,
  segmentIndex: number,
  fps?: number,
): PositionOverride[] | undefined {
  if (positionOverrides == null) return undefined
  if (positionOverrides.length === 0) return []

  let previousTimestamp = -Infinity
  for (let i = 0; i < positionOverrides.length; i++) {
    const resolvedTimestamp = parseOffset(positionOverrides[i].timestamp, fps)
    if (resolvedTimestamp < offsetSeconds) {
      throw new Error(`segments[${segmentIndex}].positionOverrides[${i}].timestamp must be >= the segment offset`)
    }
    if (resolvedTimestamp <= previousTimestamp) {
      throw new Error(`segments[${segmentIndex}].positionOverrides must be sorted ascending by timestamp`)
    }
    previousTimestamp = resolvedTimestamp
  }

  return positionOverrides.map((entry) => ({
    timestamp: parseOffset(entry.timestamp, fps),
    position: entry.position,
  }))
}

/**
 * Resolves position overrides for any segment type. For manual segments,
 * synthesizes overrides from timingData positions so all downstream
 * consumers use the single unified PositionOverride[] path.
 */
export function resolveSegmentPositionOverrides(
  segment: SegmentConfig,
  resolvedSegment: ResolvedTimingSegment,
  offsetSeconds: number,
  segmentIndex: number,
  fps?: number,
): PositionOverride[] | undefined {
  // Manual segments: synthesize from timingData positions
  if (segment.source === 'manual') {
    const laps = resolvedSegment.selectedDriver?.laps ?? []
    const overrides: PositionOverride[] = []
    for (const entry of segment.timingData) {
      if (entry.position == null) continue
      const lap = laps.find((l) => l.number === entry.lap)
      if (!lap) continue
      overrides.push({
        timestamp: roundMillis(lap.cumulative - lap.lapTime + offsetSeconds),
        position: entry.position,
      })
    }
    return overrides.length > 0 ? overrides : undefined
  }

  // All other sources: resolve from config positionOverrides
  return resolvePositionOverrides(segment.positionOverrides, offsetSeconds, segmentIndex, fps)
}

export async function loadTimingConfig(configPath: string, requireDriver: boolean): Promise<LoadedTimingConfig> {
  const absoluteConfigPath = path.resolve(configPath)
  const raw = JSON.parse(await readFile(absoluteConfigPath, 'utf8')) as Partial<TimingConfig>

  if (!Array.isArray(raw.segments) || raw.segments.length === 0) {
    throw new Error('Config file must contain a non-empty "segments" array')
  }

  const configDir = path.dirname(absoluteConfigPath)
  const segments = raw.segments.map((segment, i) => validateSegmentConfig(segment, i, configDir))

  if (requireDriver) {
    segments.forEach((seg, i) => {
      if (!seg.driver) {
        throw new Error(`segments[${i}].driver is required`)
      }
    })
  }

  return {
    segments,
    configBoxPosition: raw.boxPosition,
    configTablePosition: raw.qualifyingTablePosition,
    overlayComponents: raw.overlayComponents,
    styling: raw.styling,
  }
}

export async function resolveTimingSegments(segments: SegmentConfig[]): Promise<ResolvedTimingSegment[]> {
  return Promise.all(segments.map((segment) => resolveTimingSegment(segment, segment.driver)))
}

export async function resolveDriversCommandSegments(segments: SegmentConfig[]): Promise<DriversCommandSegment[]> {
  const resolved = await resolveTimingSegments(segments)
  return resolved.map((segment) => ({
    config: segment.config,
    capabilities: segment.capabilities,
    drivers: getDriversForDisplay(segment),
    selectedDriver: segment.selectedDriver,
  }))
}

export function getDriversForDisplay(
  segment: Pick<ResolvedTimingSegment, 'drivers' | 'selectedDriver' | 'capabilities'>,
): DriverRow[] {
  if (segment.capabilities.driverDiscovery) return segment.drivers
  return segment.selectedDriver ? [segment.selectedDriver] : []
}

export function driverListsAreIdentical(segments: DriversCommandSegment[]): boolean {
  if (segments.length <= 1) return true
  const signature = serialiseDriverList(segments[0].drivers)
  return segments.every((segment) => serialiseDriverList(segment.drivers) === signature)
}

export function filterDriverHighlights(drivers: DriverRow[], query: string | undefined): DriverRow[] {
  if (!query) return []
  const lowered = query.toLowerCase()
  return drivers.filter((driver) => driver.name.toLowerCase().includes(lowered))
}

export function formatDriverDisplay(driver: DriverRow): string {
  return driver.kart ? `[${driver.kart.padStart(3)}] ${driver.name}` : driver.name
}

export function buildSessionSegments(
  resolvedSegments: ResolvedTimingSegment[],
  offsets: number[],
): { segments: SessionSegment[]; startingGridPosition?: number } {
  const segments: SessionSegment[] = []
  let startingGridPosition: number | undefined

  for (let i = 0; i < resolvedSegments.length; i++) {
    const resolved = resolvedSegments[i]
    const selectedDriver = resolved.selectedDriver
    if (!selectedDriver) {
      throw new Error(`No selected driver resolved for segment ${i + 1}`)
    }

    const offsetSeconds = offsets[i]
    const session: SessionData = {
      driver: { kart: selectedDriver.kart, name: selectedDriver.name },
      laps: selectedDriver.laps,
      timestamps: buildLapTimestamps(selectedDriver.laps, offsetSeconds),
    }

    if (resolved.config.mode === 'race' && startingGridPosition === undefined && resolved.startingGrid) {
      const gridEntry = resolved.startingGrid.find((entry) => entry.kart === selectedDriver.kart)
      if (gridEntry) startingGridPosition = gridEntry.position
    }

    const leaderboardSourceDrivers = resolved.capabilities.leaderboard
      ? resolved.drivers.filter((driver) => driver.laps.length > 0)
      : []

    segments.push({
      mode: resolved.config.mode,
      session,
      sessionAllLaps:
        leaderboardSourceDrivers.length > 0
          ? leaderboardSourceDrivers.map((driver) => driver.laps)
          : [selectedDriver.laps],
      leaderboardDrivers:
        leaderboardSourceDrivers.length === 0
          ? undefined
          : resolved.config.mode === 'race'
            ? buildRaceDrivers(leaderboardSourceDrivers, offsetSeconds)
            : buildLeaderboardDrivers(leaderboardSourceDrivers, selectedDriver.kart, offsetSeconds),
      label: resolved.config.label,
      raceLapSnapshots:
        resolved.replayData == null ? undefined : buildRaceLapSnapshots(resolved.replayData, offsetSeconds),
    })
  }

  return { segments, startingGridPosition }
}

export function flattenTimestamps(segments: SessionSegment[]): LapTimestamp[] {
  return segments.flatMap((segment) => segment.session.timestamps).sort((a, b) => a.ytSeconds - b.ytSeconds)
}

export function buildLapTimestamps(laps: Lap[], offsetSeconds: number): LapTimestamp[] {
  return laps.map((lap) => ({
    lap,
    ytSeconds: roundMillis(lap.cumulative - lap.lapTime + offsetSeconds),
  }))
}

export function buildRaceDrivers(allDrivers: DriverRow[], offsetSeconds: number): LeaderboardDriver[] {
  return allDrivers.map((driver) => ({
    kart: driver.kart,
    name: driver.name,
    timestamps: buildLapTimestamps(driver.laps, offsetSeconds),
  }))
}

export function buildLeaderboardDrivers(
  allDrivers: DriverRow[],
  ourKart: string,
  offsetSeconds: number,
): LeaderboardDriver[] {
  const ourDriver = allDrivers.find((driver) => driver.kart === ourKart)
  if (!ourDriver) return []

  const ourTotal = ourDriver.laps.reduce((sum, lap) => sum + lap.lapTime, 0)
  const sessionEnd = offsetSeconds + ourTotal

  return allDrivers.map((driver) => {
    const driverTotal = driver.laps.reduce((sum, lap) => sum + lap.lapTime, 0)
    const driverStart = sessionEnd - driverTotal
    return {
      kart: driver.kart,
      name: driver.name,
      timestamps: buildLapTimestamps(driver.laps, driverStart),
    }
  })
}

export function validateManualTimingData(value: JsonValue | undefined, segmentIndex: number): ManualTimingEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`segments[${segmentIndex}].timingData must be a non-empty array`)
  }

  const parsed = value.map((entry, entryIndex) => {
    if (entry == null || typeof entry !== 'object') {
      throw new Error(`segments[${segmentIndex}].timingData[${entryIndex}] must be an object`)
    }

    const lap = (entry as JsonObject).lap
    const time = (entry as JsonObject).time
    const position = (entry as JsonObject).position
    if (typeof lap !== 'number' || !Number.isInteger(lap) || lap < 0) {
      throw new Error(`segments[${segmentIndex}].timingData[${entryIndex}].lap must be an integer >= 0`)
    }
    if (typeof time !== 'string' || parseLapTimeText(time) === null) {
      throw new Error(`segments[${segmentIndex}].timingData[${entryIndex}].time must be a lap time string`)
    }
    if (position !== undefined && (typeof position !== 'number' || !Number.isInteger(position) || position < 1)) {
      throw new Error(`segments[${segmentIndex}].timingData[${entryIndex}].position must be an integer >= 1`)
    }
    return { lap, time, ...(typeof position === 'number' ? { position } : {}) }
  })

  const firstLap = parsed[0].lap
  if (firstLap !== 0 && firstLap !== 1) {
    throw new Error(`segments[${segmentIndex}].timingData must start at lap 0 or lap 1`)
  }

  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i].lap !== parsed[i - 1].lap + 1) {
      throw new Error(`segments[${segmentIndex}].timingData must be sequential without gaps`)
    }
  }

  return parsed
}

export function buildManualDriver(driverName: string, timingData: ManualTimingEntry[]): DriverRow {
  const parsed = timingData.map((entry) => ({
    number: entry.lap,
    lapTime: parseLapTimeText(entry.time)!,
  }))

  return {
    kart: '',
    name: driverName,
    laps: buildLaps(parsed, true),
  }
}

export function extractSpeedhiveSessionId(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid Daytona Speedhive URL: ${url}`)
  }

  if (parsed.hostname !== 'speedhive.mylaps.com') {
    throw new Error('Daytona URLs must use speedhive.mylaps.com')
  }

  const match = parsed.pathname.match(/\/sessions\/(\d+)/)
  if (!match) {
    throw new Error('Daytona URL must contain a numeric /sessions/{id} path')
  }

  return match[1]
}

export function parseTeamsportEmailBody(body: string): TeamsportParsedEmail {
  const $ = cheerio.load(body)

  // Real TeamSport emails contain multiple datagrid tables (heat overview,
  // detailed lap times, best-of-day/week/month leaderboards).  The detailed
  // lap-times table is the one whose header row starts with a blank <th>
  // (the lap-number column) followed by individual driver-name <th> cells.
  const candidates = $('table.datagrid').toArray()
  // cheerio 1.x doesn't re-export Element/AnyNode (they live in domhandler,
  // a transitive dep we don't declare directly), so we infer the wrapped type.
  let table: ReturnType<typeof $> | undefined
  let names: string[] = []

  for (const candidate of candidates) {
    const headerRow = $(candidate).find('tr').first()
    const ths = headerRow.find('th').toArray()
    if (ths.length < 3) continue

    const firstHeader = $(ths[0]).text().trim()
    if (firstHeader !== '') continue

    const candidateNames = ths.slice(1).map((th) => $(th).text().trim()).filter(Boolean)
    if (candidateNames.length > 0) {
      table = $(candidate)
      names = candidateNames
      break
    }
  }

  if (!table || names.length === 0) {
    // Fall back to the original behaviour for simple emails with a single table
    const fallback = $(candidates[0])
    if (!fallback.length) {
      throw new Error('Could not find TeamSport results table in email body')
    }
    const headers = fallback.find('tr').first().find('th').slice(1).toArray()
    names = headers.map((header) => $(header).text().trim()).filter(Boolean)
    if (names.length === 0) {
      throw new Error('Could not parse TeamSport driver names from email')
    }
    table = fallback
  }
  if (names.length === 0) {
    throw new Error('Could not parse TeamSport driver names from email')
  }

  const entriesByDriver = names.map(() => [] as Array<{ number: number; lapTime: number }>)
  for (const row of table.find('tr').slice(1).toArray()) {
    const cells = $(row).find('td')
    const lapNumber = parseInt(cells.eq(0).text().trim(), 10)
    if (!Number.isFinite(lapNumber)) continue

    names.forEach((_, index) => {
      const text = cells
        .eq(index + 1)
        .text()
        .trim()
      const lapTime = parseLapTimeText(text)
      if (lapTime === null) return
      entriesByDriver[index].push({ number: lapNumber, lapTime })
    })
  }

  return {
    drivers: names.map((name: string, index: number) => ({
      kart: '',
      name,
      laps: buildLaps(entriesByDriver[index]),
    })),
  }
}

export function parseDaytonaEmailBody(body: string): DaytonaParsedEmail {
  const $ = cheerio.load(body)
  const selectedDriverName = $('#lblName').first().text().trim()
  const selectedKart = $('#lblKartNo').first().text().trim()
  if (!selectedDriverName || !selectedKart) {
    throw new Error('Could not parse Daytona driver summary from email body')
  }

  const lapEntries = $('#dlLapTime span[id^="dlLapTime_lblTime_"]')
    .toArray()
    .map((element) => parseDaytonaLapRow($(element).text()))
    .filter((entry): entry is { number: number; lapTime: number } => entry != null)

  if (lapEntries.length === 0) {
    throw new Error('Could not parse Daytona lap times from email body')
  }

  const selectedDriver: DriverRow = {
    kart: selectedKart,
    name: selectedDriverName,
    laps: buildLaps(lapEntries),
  }

  const classificationTable = $('table')
    .toArray()
    .map((element) => $(element))
    .find((table) => {
      const headers = table
        .find('tr')
        .first()
        .find('td,th')
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      return headers.includes('Kart') && headers.includes('Racer') && headers.includes('Best Lap')
    })

  if (!classificationTable) {
    return {
      drivers: [selectedDriver],
      selectedDriver,
    }
  }

  const drivers = classificationTable
    .find('tr')
    .slice(1)
    .toArray()
    .flatMap((row) => {
      const cells = $(row).find('td')
      if (cells.length < 3) return []

      const kart = cells.eq(1).text().replace(/\s+/g, ' ').trim()
      const name = normaliseDaytonaDriverName(cells.eq(2).text())
      if (!kart || !name) return []

      if (kart === selectedDriver.kart) return [selectedDriver]
      return [{ kart, name, laps: [] as Lap[] }]
    })

  if (!drivers.some((driver) => driver.kart === selectedDriver.kart)) {
    drivers.push(selectedDriver)
  }

  return { drivers, selectedDriver }
}

export async function readBestEmlBody(emailPath: string): Promise<string> {
  const raw = await readFile(emailPath, 'utf8')
  const bodies = parseMimeBodies(raw)
  if (bodies.length === 0) {
    throw new Error(`Could not extract a body from ${emailPath}`)
  }

  const ordered = [
    ...bodies.filter((body) => body.contentType.includes('text/html')),
    ...bodies.filter((body) => body.contentType.includes('text/plain')),
    ...bodies,
  ]

  for (const body of ordered) {
    if (body.body.includes('table class="datagrid"') || body.body.includes('class="datagrid"')) {
      return body.body
    }
  }

  return ordered[0].body
}

function validateSegmentConfig(value: JsonObject, segmentIndex: number, configDir: string): SegmentConfig {
  const source = value.source
  const modeValue = value.mode
  const offset = value.offset
  const label = value.label
  const driver = typeof value.driver === 'string' && value.driver.trim() ? value.driver.trim() : undefined

  if (
    typeof source !== 'string' ||
    !['alphaTiming', 'teamsportEmail', 'daytonaEmail', 'mylapsSpeedhive', 'manual', 'cached'].includes(source)
  ) {
    throw new Error(`segments[${segmentIndex}] is missing a valid "source"`)
  }
  const timingSource = source as TimingSource
  if (typeof modeValue !== 'string' || !['practice', 'qualifying', 'race'].includes(modeValue)) {
    throw new Error(`segments[${segmentIndex}] is missing a valid "mode"`)
  }
  const mode = modeValue as SessionMode
  if (typeof offset !== 'string' || !offset) {
    throw new Error(`segments[${segmentIndex}] is missing "offset"`)
  }
  if (label !== undefined && typeof label !== 'string') {
    throw new Error(`segments[${segmentIndex}].label must be a string`)
  }

  const positionOverrides = validatePositionOverrideConfig(value.positionOverrides, mode, segmentIndex)

  switch (timingSource) {
    case 'alphaTiming': {
      const url = value.url
      if (typeof url !== 'string' || !url) {
        throw new Error(`segments[${segmentIndex}] is missing "url"`)
      }
      if ('emailPath' in value) {
        throw new Error(`segments[${segmentIndex}].emailPath is not valid for source "alphaTiming"`)
      }
      if ('timingData' in value) {
        throw new Error(`segments[${segmentIndex}].timingData is only valid for source "manual"`)
      }
      return { source: timingSource, mode, offset, label, driver, positionOverrides, url }
    }
    case 'teamsportEmail': {
      const emailPath = value.emailPath
      if (typeof emailPath !== 'string' || !emailPath) {
        throw new Error(`segments[${segmentIndex}] is missing "emailPath"`)
      }
      if ('url' in value) {
        throw new Error(`segments[${segmentIndex}].url is not valid for source "teamsportEmail"`)
      }
      if ('timingData' in value) {
        throw new Error(`segments[${segmentIndex}].timingData is only valid for source "manual"`)
      }
      return {
        source: timingSource,
        mode,
        offset,
        label,
        driver,
        positionOverrides,
        emailPath: path.resolve(configDir, emailPath),
      }
    }
    case 'daytonaEmail': {
      const emailPath = value.emailPath
      if (typeof emailPath !== 'string' || !emailPath) {
        throw new Error(`segments[${segmentIndex}] is missing "emailPath"`)
      }
      if ('url' in value) {
        throw new Error(`segments[${segmentIndex}].url is not valid for source "daytonaEmail"`)
      }
      if ('timingData' in value) {
        throw new Error(`segments[${segmentIndex}].timingData is only valid for source "manual"`)
      }
      return {
        source: timingSource,
        mode,
        offset,
        label,
        driver,
        positionOverrides,
        emailPath: path.resolve(configDir, emailPath),
      }
    }
    case 'mylapsSpeedhive': {
      const url = value.url
      if (typeof url !== 'string' || !url) {
        throw new Error(`segments[${segmentIndex}] is missing "url"`)
      }
      extractSpeedhiveSessionId(url)
      if ('emailPath' in value) {
        throw new Error(`segments[${segmentIndex}].emailPath is not valid for source "mylapsSpeedhive"`)
      }
      if ('timingData' in value) {
        throw new Error(`segments[${segmentIndex}].timingData is only valid for source "manual"`)
      }
      return { source: timingSource, mode, offset, label, driver, positionOverrides, url }
    }
    case 'manual': {
      if ('url' in value) {
        throw new Error(`segments[${segmentIndex}].url is not valid for source "manual"`)
      }
      if ('emailPath' in value) {
        throw new Error(`segments[${segmentIndex}].emailPath is not valid for source "manual"`)
      }
      return {
        source: timingSource,
        mode,
        offset,
        label,
        driver,
        positionOverrides,
        timingData: validateManualTimingData(value.timingData, segmentIndex),
      }
    }
    case 'cached': {
      const VALID_ORIGINAL_SOURCES = ['alphaTiming', 'teamsportEmail', 'daytonaEmail', 'mylapsSpeedhive', 'manual']
      const originalSource = value.originalSource
      if (typeof originalSource !== 'string' || !VALID_ORIGINAL_SOURCES.includes(originalSource)) {
        throw new Error(`segments[${segmentIndex}].originalSource must be one of: ${VALID_ORIGINAL_SOURCES.join(', ')}`)
      }
      if (!Array.isArray(value.drivers)) {
        throw new Error(`segments[${segmentIndex}].drivers must be an array for cached source`)
      }
      if (value.capabilities == null || typeof value.capabilities !== 'object') {
        throw new Error(`segments[${segmentIndex}].capabilities is required for cached source`)
      }
      return {
        source: 'cached' as const,
        mode,
        offset,
        label,
        driver,
        positionOverrides,
        originalSource: originalSource as Exclude<TimingSource, 'cached'>,
        drivers: value.drivers as unknown as DriverRow[],
        capabilities: value.capabilities as unknown as TimingCapabilities,
        startingGrid: Array.isArray(value.startingGrid) ? (value.startingGrid as unknown as GridEntry[]) : undefined,
        replayData: Array.isArray(value.replayData) ? (value.replayData as unknown as ReplayLapData) : undefined,
      } satisfies CachedSegmentConfig
    }
  }

  return assertNever(timingSource)
}

async function resolveTimingSegment(segment: SegmentConfig, driverQuery?: string): Promise<ResolvedTimingSegment> {
  switch (segment.source) {
    case 'alphaTiming':
      return resolveAlphaTimingSegment(segment, driverQuery)
    case 'teamsportEmail':
      return resolveTeamsportEmailSegment(segment, driverQuery)
    case 'daytonaEmail':
      return resolveDaytonaEmailSegment(segment, driverQuery)
    case 'mylapsSpeedhive':
      return resolveMylapsSpeedhiveSegment(segment, driverQuery)
    case 'manual':
      return resolveManualSegment(segment, driverQuery)
    case 'cached':
      return resolveCachedSegment(segment, driverQuery)
  }

  throw new Error('Unsupported timing source')
}

async function resolveAlphaTimingSegment(
  segment: AlphaTimingSegmentConfig,
  driverQuery?: string,
): Promise<ResolvedTimingSegment> {
  const html = await fetchHtml(segment.url)
  const drivers = parseDrivers(html)
  const selectedDriver = driverQuery ? matchDriver(drivers, driverQuery, segment.url) : undefined

  let startingGrid: GridEntry[] | undefined
  let replayData: ReplayLapData | undefined
  if (segment.mode === 'race') {
    const [gridHtml, replayHtml] = await Promise.all([fetchGridHtml(segment.url), fetchReplayHtml(segment.url)])
    startingGrid = parseGrid(gridHtml)
    replayData = parseReplayLapData(replayHtml)
  }

  return {
    config: segment,
    drivers,
    selectedDriver,
    capabilities: {
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: true,
      classificationPosition: true,
      leaderboard: true,
      gapToLeader: segment.mode === 'race',
      gapToKartAhead: segment.mode === 'race',
      gapToKartBehind: false,
      startingGrid: segment.mode === 'race',
      raceSnapshots: segment.mode === 'race',
    },
    startingGrid,
    replayData,
  }
}

async function resolveTeamsportEmailSegment(
  segment: TeamSportEmailSegmentConfig,
  driverQuery?: string,
): Promise<ResolvedTimingSegment> {
  const body = await readBestEmlBody(segment.emailPath)
  const parsed = parseTeamsportEmailBody(body)
  const selectedDriver = driverQuery ? matchDriver(parsed.drivers, driverQuery, segment.emailPath) : undefined

  return {
    config: segment,
    drivers: parsed.drivers,
    selectedDriver,
    capabilities: {
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: true,
      classificationPosition: true,
      leaderboard: true,
      gapToLeader: false,
      gapToKartAhead: false,
      gapToKartBehind: false,
      startingGrid: false,
      raceSnapshots: false,
    },
  }
}

async function resolveDaytonaEmailSegment(
  segment: DaytonaEmailSegmentConfig,
  driverQuery?: string,
): Promise<ResolvedTimingSegment> {
  const body = await readBestEmlBody(segment.emailPath)
  const parsed = parseDaytonaEmailBody(body)
  const selectedDriver = driverQuery
    ? matchDriver(parsed.drivers, driverQuery, segment.emailPath)
    : parsed.selectedDriver

  return {
    config: segment,
    drivers: parsed.drivers,
    selectedDriver,
    capabilities: {
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: false,
      classificationPosition: true,
      leaderboard: false,
      gapToLeader: false,
      gapToKartAhead: false,
      gapToKartBehind: false,
      startingGrid: false,
      raceSnapshots: false,
    },
  }
}

async function resolveMylapsSpeedhiveSegment(
  segment: MylapsSpeedhiveSegmentConfig,
  driverQuery?: string,
): Promise<ResolvedTimingSegment> {
  const sessionId = extractSpeedhiveSessionId(segment.url)

  const [session, classification, lapchart] = await Promise.all([
    fetchDaytonaJson<DaytonaSessionResponse>(`/sessions/${sessionId}`),
    fetchDaytonaJson<DaytonaClassificationResponse>(`/sessions/${sessionId}/classification`),
    segment.mode === 'race'
      ? fetchDaytonaJson<DaytonaLapchartResponse>(`/sessions/${sessionId}/lapchart`)
      : Promise.resolve(undefined),
  ])

  if (!session || !classification) {
    throw new Error(`Could not resolve Daytona session ${sessionId}`)
  }

  const lapDataResponses = await Promise.all(
    classification.rows.map((_, index) =>
      fetchDaytonaJson<DaytonaLapDataResponse>(`/sessions/${sessionId}/lapdata/${index + 1}/laps`),
    ),
  )

  const drivers = lapDataResponses.map((response) => {
    if (response.lapDataInfo == null) {
      throw new Error(`Missing Daytona participant lap data for session ${sessionId}`)
    }
    return {
      kart: response.lapDataInfo.participantInfo.startNr ?? '',
      name: response.lapDataInfo.participantInfo.name,
      laps: buildLaps(
        response.laps
          .map((lap) => ({ number: lap.lapNr, lapTime: parseLapTimeText(lap.lapTime) }))
          .filter((lap): lap is { number: number; lapTime: number } => lap.lapTime != null),
      ),
    }
  })

  const selectedDriver = driverQuery ? matchDriver(drivers, driverQuery, segment.url) : undefined
  const startingGrid = lapchart?.startPositions?.map((entry, index) => ({
    position: index + 1,
    kart: entry.startNumber,
    name: entry.name,
  }))

  return {
    config: segment,
    drivers,
    selectedDriver,
    capabilities: {
      driverDiscovery: true,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: true,
      classificationPosition: true,
      leaderboard: true,
      gapToLeader: false,
      gapToKartAhead: false,
      gapToKartBehind: false,
      startingGrid: startingGrid != null,
      raceSnapshots: false,
    },
    startingGrid,
  }
}

async function resolveManualSegment(
  segment: ManualSegmentConfig,
  driverQuery?: string,
): Promise<ResolvedTimingSegment> {
  const selectedDriver = driverQuery ? buildManualDriver(driverQuery, segment.timingData) : undefined
  const hasPositions = segment.timingData.some((entry) => entry.position != null)

  return {
    config: segment,
    drivers: selectedDriver ? [selectedDriver] : [],
    selectedDriver,
    capabilities: {
      driverDiscovery: false,
      lapTimes: true,
      bestLap: true,
      lastLap: true,
      position: hasPositions,
      classificationPosition: false,
      leaderboard: false,
      gapToLeader: false,
      gapToKartAhead: false,
      gapToKartBehind: false,
      startingGrid: false,
      raceSnapshots: false,
    },
  }
}

async function resolveCachedSegment(
  segment: CachedSegmentConfig,
  driverQuery?: string,
): Promise<ResolvedTimingSegment> {
  const selectedDriver = driverQuery ? matchDriver(segment.drivers, driverQuery, 'cached data') : undefined

  return {
    config: segment,
    drivers: segment.drivers,
    selectedDriver,
    capabilities: segment.capabilities,
    startingGrid: segment.startingGrid,
    replayData: segment.replayData,
  }
}

async function fetchDaytonaJson<T>(pathname: string): Promise<T> {
  const response = await fetch(`${DAYTONA_API_BASE}${pathname}`)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching Daytona API ${pathname}`)
  }
  return response.json() as Promise<T>
}

function matchDriver(drivers: DriverRow[], query: string, context: string): DriverRow {
  const lowered = query.toLowerCase()
  const matches = drivers.filter((driver) => driver.name.toLowerCase().includes(lowered))
  if (matches.length === 0) {
    throw new Error(
      `No driver matching "${query}" found for ${context}. Available: ${drivers.map((driver) => driver.name).join(', ')}`,
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `"${query}" is ambiguous for ${context}. Matches:\n` +
        matches.map((driver) => `  ${formatDriverDisplay(driver)}`).join('\n'),
    )
  }
  return matches[0]
}

function buildLaps(entries: Array<{ number: number; lapTime: number }>, allowFormationLap = false): Lap[] {
  let cumulative = 0
  return entries.map((entry, index) => {
    if (allowFormationLap && index === 0 && entry.number === 0) {
      return { number: entry.number, lapTime: entry.lapTime, cumulative: 0 }
    }

    cumulative = roundMillis(cumulative + entry.lapTime)
    return {
      number: entry.number,
      lapTime: entry.lapTime,
      cumulative,
    }
  })
}

function parseLapTimeText(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const result = parseFloat(trimmed)
    return Number.isFinite(result) ? result : null
  }

  const parts = trimmed.split(':')
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10)
    const seconds = parseFloat(parts[1])
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return minutes * 60 + seconds
  }

  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1], 10)
    const seconds = parseFloat(parts[2])
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return hours * 3600 + minutes * 60 + seconds
  }

  return null
}

function parseDaytonaLapRow(value: string): { number: number; lapTime: number } | null {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  const match = trimmed.match(/^(\d+)\s+([0-9:]+)(?:\s+\[\d+\])?$/)
  if (!match) return null

  const number = parseInt(match[1], 10)
  const lapTime = parseDaytonaTimeText(match[2])
  if (!Number.isFinite(number) || lapTime == null) return null

  return { number, lapTime }
}

function parseDaytonaTimeText(value: string): number | null {
  const trimmed = value.trim()
  const clubspeedMatch = trimmed.match(/^(\d+):(\d{2}):(\d{3})$/)
  if (clubspeedMatch) {
    const minutes = parseInt(clubspeedMatch[1], 10)
    const seconds = parseInt(clubspeedMatch[2], 10)
    const millis = parseInt(clubspeedMatch[3], 10)
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(millis)) return null
    return minutes * 60 + seconds + millis / 1000
  }

  const secondsMillisMatch = trimmed.match(/^(\d+):(\d{3})$/)
  if (secondsMillisMatch) {
    const seconds = parseInt(secondsMillisMatch[1], 10)
    const millis = parseInt(secondsMillisMatch[2], 10)
    if (!Number.isFinite(seconds) || !Number.isFinite(millis)) return null
    return seconds + millis / 1000
  }

  return parseLapTimeText(trimmed)
}

function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000
}

function serialiseDriverList(drivers: DriverRow[]): string {
  return JSON.stringify(drivers.map((driver) => ({ kart: driver.kart, name: driver.name })))
}

function normaliseDaytonaDriverName(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[A-Z]-\s*/i, '')
    .trim()
}

function parseMimeBodies(raw: string): Array<{ contentType: string; body: string }> {
  const { headers, body } = splitMimeEntity(raw)
  const contentType = headers['content-type'] ?? 'text/plain'

  if (contentType.toLowerCase().startsWith('multipart/')) {
    const boundary = getHeaderParam(contentType, 'boundary')
    if (!boundary) return []

    return splitMultipartBody(body, boundary).flatMap((part) => parseMimeBodies(part))
  }

  return [
    {
      contentType: contentType.toLowerCase(),
      body: decodeMimeBody(body, headers['content-transfer-encoding']),
    },
  ]
}

function splitMimeEntity(raw: string): { headers: Record<string, string>; body: string } {
  const normalised = raw.replace(/\r\n/g, '\n')
  const separatorIndex = normalised.indexOf('\n\n')
  if (separatorIndex === -1) {
    return { headers: {}, body: normalised }
  }

  const headerText = normalised.slice(0, separatorIndex)
  const body = normalised.slice(separatorIndex + 2)
  const unfolded = headerText.replace(/\n[ \t]+/g, ' ')
  const headers: Record<string, string> = {}
  for (const line of unfolded.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    headers[line.slice(0, colonIndex).trim().toLowerCase()] = line.slice(colonIndex + 1).trim()
  }

  return { headers, body }
}

function getHeaderParam(headerValue: string, key: string): string | undefined {
  const match = headerValue.match(new RegExp(`${key}=\"?([^\";]+)`, 'i'))
  return match?.[1]
}

function splitMultipartBody(body: string, boundary: string): string[] {
  const marker = `--${boundary}`
  return body
    .split(marker)
    .slice(1)
    .map((part) => part.replace(/^\n/, '').replace(/\n--$/, '').trim())
    .filter((part) => part && part !== '--')
}

function decodeMimeBody(body: string, encoding: string | undefined): string {
  const normalisedEncoding = encoding?.toLowerCase()
  if (normalisedEncoding?.includes('base64')) {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')
  }

  if (normalisedEncoding?.includes('quoted-printable')) {
    return body.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  }

  return body
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}
