/**
 * Smart video file ordering for known camera naming conventions.
 *
 * Supported cameras:
 * - GoPro Hero5-7: GP{chapter:2}{session:4}.MP4
 * - GoPro Hero8+:  GX{chapter:2}{session:4}.MP4
 * - DJI (timestamp): DJI_{timestamp:14}_{seq:4}_{type}.MP4
 * - DJI (legacy):    DJI_{seq:4}.MP4
 * - Insta360:        VID_{date:8}_{time:6}_{lens:2}_{seq:3}.mp4/insv
 */

// ---------------------------------------------------------------------------
// GoPro
// ---------------------------------------------------------------------------

interface GoProFile {
  path: string
  chapter: number
  sessionId: string
}

const GOPRO_PATTERN = /^G[PX](\d{2})(\d{4})\.\w+$/i

function parseGoProFilename(filePath: string): GoProFile | null {
  const filename = filePath.split(/[\\/]/).pop() ?? ''
  const match = GOPRO_PATTERN.exec(filename)
  if (!match) return null
  return { path: filePath, chapter: parseInt(match[1], 10), sessionId: match[2] }
}

function sortGoPro(files: GoProFile[]): string[] {
  return [...files]
    .sort((a, b) => {
      if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId)
      return a.chapter - b.chapter
    })
    .map((f) => f.path)
}

// ---------------------------------------------------------------------------
// DJI (timestamp format): DJI_YYYYMMDDHHmmss_NNNN_T.MP4
// ---------------------------------------------------------------------------

interface DjiTimestampFile {
  path: string
  timestamp: string // 14-digit recording start time (groups chapters)
  seq: number
}

const DJI_TS_PATTERN = /^DJI_(\d{14})_(\d{4})_[A-Z]\.\w+$/i

function parseDjiTimestampFilename(filePath: string): DjiTimestampFile | null {
  const filename = filePath.split(/[\\/]/).pop() ?? ''
  const match = DJI_TS_PATTERN.exec(filename)
  if (!match) return null
  return { path: filePath, timestamp: match[1], seq: parseInt(match[2], 10) }
}

function sortDjiTimestamp(files: DjiTimestampFile[]): string[] {
  return [...files]
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp)
      return a.seq - b.seq
    })
    .map((f) => f.path)
}

// ---------------------------------------------------------------------------
// DJI (legacy format): DJI_NNNN.MP4
// ---------------------------------------------------------------------------

interface DjiLegacyFile {
  path: string
  seq: number
}

const DJI_LEGACY_PATTERN = /^DJI_(\d{4})\.\w+$/i

function parseDjiLegacyFilename(filePath: string): DjiLegacyFile | null {
  const filename = filePath.split(/[\\/]/).pop() ?? ''
  const match = DJI_LEGACY_PATTERN.exec(filename)
  if (!match) return null
  return { path: filePath, seq: parseInt(match[1], 10) }
}

function sortDjiLegacy(files: DjiLegacyFile[]): string[] {
  return [...files].sort((a, b) => a.seq - b.seq).map((f) => f.path)
}

// ---------------------------------------------------------------------------
// Insta360: VID_YYYYMMDD_HHmmss_LL_NNN.mp4/insv
// (PRO_VID variant also supported)
// ---------------------------------------------------------------------------

interface Insta360File {
  path: string
  dateTime: string // date + time concatenated (groups chapters)
  lens: string     // "00" = back, "10" = front
  seq: number
}

const INSTA360_PATTERN = /^(?:PRO_)?VID_(\d{8})_(\d{6})_(\d{2})_(\d{3})\.\w+$/i

function parseInsta360Filename(filePath: string): Insta360File | null {
  const filename = filePath.split(/[\\/]/).pop() ?? ''
  const match = INSTA360_PATTERN.exec(filename)
  if (!match) return null
  return {
    path: filePath,
    dateTime: match[1] + match[2],
    lens: match[3],
    seq: parseInt(match[4], 10),
  }
}

function sortInsta360(files: Insta360File[]): string[] {
  return [...files]
    .sort((a, b) => {
      if (a.dateTime !== b.dateTime) return a.dateTime.localeCompare(b.dateTime)
      if (a.seq !== b.seq) return a.seq - b.seq
      return a.lens.localeCompare(b.lens)
    })
    .map((f) => f.path)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type ParseResult =
  | { type: 'gopro'; file: GoProFile }
  | { type: 'dji-ts'; file: DjiTimestampFile }
  | { type: 'dji-legacy'; file: DjiLegacyFile }
  | { type: 'insta360'; file: Insta360File }
  | { type: 'unknown' }

function parseAny(filePath: string): ParseResult {
  const gopro = parseGoProFilename(filePath)
  if (gopro) return { type: 'gopro', file: gopro }

  const djiTs = parseDjiTimestampFilename(filePath)
  if (djiTs) return { type: 'dji-ts', file: djiTs }

  const djiLegacy = parseDjiLegacyFilename(filePath)
  if (djiLegacy) return { type: 'dji-legacy', file: djiLegacy }

  const insta = parseInsta360Filename(filePath)
  if (insta) return { type: 'insta360', file: insta }

  return { type: 'unknown' }
}

/**
 * Sort video file paths using camera-specific naming conventions.
 *
 * When ALL files match a single known camera pattern, sort by session/timestamp
 * then chapter/sequence number. When files are mixed or unrecognised,
 * preserve the original order.
 *
 * Does not mutate the input array.
 */
export function smartSortVideoPaths(paths: string[]): string[] {
  if (paths.length <= 1) return [...paths]

  const parsed = paths.map(parseAny)
  const types = new Set(parsed.map((p) => p.type))

  // Only sort if ALL files match a single camera pattern
  if (types.size !== 1 || types.has('unknown')) return [...paths]

  const type = parsed[0].type

  if (type === 'gopro') {
    return sortGoPro(parsed.map((p) => (p as { type: 'gopro'; file: GoProFile }).file))
  }
  if (type === 'dji-ts') {
    return sortDjiTimestamp(parsed.map((p) => (p as { type: 'dji-ts'; file: DjiTimestampFile }).file))
  }
  if (type === 'dji-legacy') {
    return sortDjiLegacy(parsed.map((p) => (p as { type: 'dji-legacy'; file: DjiLegacyFile }).file))
  }
  if (type === 'insta360') {
    return sortInsta360(parsed.map((p) => (p as { type: 'insta360'; file: Insta360File }).file))
  }

  return [...paths]
}
