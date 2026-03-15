#!/usr/bin/env node
import { program } from 'commander'
import { fetchHtml, fetchGridHtml, parseDrivers, parseGrid, fetchReplayHtml, parseReplayLapData } from '@racedash/scraper'
import type { DriverRow, ReplayLapData } from '@racedash/scraper'
import { parseOffset, calculateTimestamps, formatChapters } from '@racedash/timestamps'
import { selectDriver, resolveVideoFiles } from './select'
import path from 'node:path'
import { access, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { compositeVideo, getVideoDuration, getVideoFps, getVideoResolution, renderOverlay, joinVideos } from '@racedash/compositor'
import {
  type CornerPosition,
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  type BoxPosition,
  type LapTimestamp,
  type OverlayProps,
  type LeaderboardDriver,
  type SessionData,
  type SessionMode,
  type SessionSegment,
  type PositionOverride,
  type RaceLapEntry,
  type RaceLapSnapshot,
  type OverlayStyling,
} from '@racedash/core'

function buildRaceDrivers(
  allDrivers: DriverRow[],
  offsetSeconds: number,
): LeaderboardDriver[] {
  // All drivers start simultaneously at offsetSeconds
  return allDrivers.map(d => {
    let ytSeconds = offsetSeconds
    const timestamps: LapTimestamp[] = d.laps.map(lap => {
      const ts = { lap, ytSeconds }
      ytSeconds += lap.lapTime
      return ts
    })
    return { kart: d.kart, name: d.name, timestamps }
  })
}

function buildLeaderboardDrivers(
  allDrivers: DriverRow[],
  ourKart: string,
  offsetSeconds: number,
): LeaderboardDriver[] {
  // Align everyone to finish at the same time as our driver
  const ourDriver = allDrivers.find(d => d.kart === ourKart)
  if (!ourDriver) return []

  const ourTotal = ourDriver.laps.reduce((s, l) => s + l.lapTime, 0)
  const sessionEnd = offsetSeconds + ourTotal

  return allDrivers.map(d => {
    const driverTotal = d.laps.reduce((s, l) => s + l.lapTime, 0)
    const driverStart = sessionEnd - driverTotal

    let ytSeconds = driverStart
    const timestamps: LapTimestamp[] = d.laps.map(lap => {
      const ts = { lap, ytSeconds }
      ytSeconds += lap.lapTime
      return ts
    })

    return { kart: d.kart, name: d.name, timestamps }
  })
}

export function buildRaceLapSnapshots(replayData: ReplayLapData, offsetSeconds: number): RaceLapSnapshot[] {
  const result: RaceLapSnapshot[] = []
  for (let i = 1; i < replayData.length; i++) {
    const snapshot = replayData[i]
    const p1 = snapshot.find(e => e.position === 1)
    if (!p1 || p1.totalSeconds === null) continue
    const videoTimestamp = offsetSeconds + p1.totalSeconds
    const entries: RaceLapEntry[] = snapshot.map(e => ({
      kart: e.kart,
      name: e.name,
      position: e.position,
      lapsCompleted: e.lapsCompleted,
      gapToLeader: e.gapToLeader,
      intervalToAhead: e.intervalToAhead,
    }))
    result.push({ leaderLap: i, videoTimestamp, entries })
  }
  return result
}

interface PositionOverrideConfig {
  timestamp: string
  position: number
}

type OutputResolutionPreset = '1080p' | '1440p' | '2160p'

const OUTPUT_RESOLUTIONS: Record<OutputResolutionPreset, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
}

const VALID_BOX_POSITIONS: BoxPosition[] = ['bottom-left', 'bottom-center', 'bottom-right', 'top-left', 'top-center', 'top-right']
const VALID_TABLE_POSITIONS: CornerPosition[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right']

function defaultBoxPositionForStyle(style: string): BoxPosition {
  return style === 'modern' ? 'bottom-center' : 'bottom-left'
}

export function resolveOutputResolutionPreset(
  preset: string | undefined,
): { preset: OutputResolutionPreset; width: number; height: number } | undefined {
  if (preset == null) return undefined
  if (!(preset in OUTPUT_RESOLUTIONS)) {
    throw new Error('--output-resolution must be one of: 1080p, 1440p, 2160p')
  }
  const typedPreset = preset as OutputResolutionPreset
  return { preset: typedPreset, ...OUTPUT_RESOLUTIONS[typedPreset] }
}

export function validatePositionOverrideConfig(
  positionOverrides: unknown,
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

    const { timestamp } = entry as Partial<PositionOverrideConfig>
    const positionValue = (entry as { position?: unknown }).position
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
      throw new Error(
        `segments[${segmentIndex}].positionOverrides[${i}].timestamp must be >= the segment offset`,
      )
    }
    if (resolvedTimestamp <= previousTimestamp) {
      throw new Error(`segments[${segmentIndex}].positionOverrides must be sorted ascending by timestamp`)
    }
    previousTimestamp = resolvedTimestamp
  }

  return positionOverrides.map(entry => ({
    timestamp: parseOffset(entry.timestamp, fps),
    position: entry.position,
  }))
}

program
  .name('racedash')
  .description('Alpha Timing → YouTube chapters + geometric overlay')
  .version('0.1.0')

program
  .command('drivers <url>')
  .description('List all drivers for a session')
  .action(async (url: string) => {
    try {
      console.error('Fetching...')
      const html = await fetchHtml(url)
      const drivers = parseDrivers(html)
      drivers.forEach((d, i) =>
        console.log(`  ${String(i + 1).padStart(2)}. [${d.kart.padStart(3)}] ${d.name}`),
      )
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('timestamps <url> [driver]')
  .description('Output YouTube chapter timestamps to stdout')
  .requiredOption('--offset <time>', 'Video timestamp at race start, e.g. 0:02:15.500 or 12345 F')
  .option('--fps <n>', 'Video fps used when --offset is given as "<frames> F"')
  .action(async (url: string, driverQuery: string | undefined, opts: { offset: string, fps?: string }) => {
    try {
      let fps: number | undefined
      if (opts.fps != null) {
        const parsedFps = parseFloat(opts.fps)
        if (!Number.isFinite(parsedFps) || parsedFps <= 0) {
          throw new Error('--fps must be a positive number')
        }
        fps = parsedFps
      }
      const offsetSeconds = parseOffset(opts.offset, fps)
      console.error('Fetching...')
      const html = await fetchHtml(url)
      const drivers = parseDrivers(html)
      const driver = await selectDriver(drivers, driverQuery)
      const timestamps = calculateTimestamps(driver.laps, offsetSeconds)
      console.error(`\nDriver: [${driver.kart}] ${driver.name} — ${driver.laps.length} laps\n`)
      console.log(formatChapters(timestamps))
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('join <files...>')
  .description('Concatenate GoPro chapter files into a single video (lossless)')
  .option('--output <path>', 'Output file path', './joined.mp4')
  .action(async (files: string[], opts: { output: string }) => {
    try {
      console.error(`Joining ${files.length} files...`)
      await joinVideos(files, opts.output)
      console.log(`Done: ${opts.output}`)
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

interface RenderOpts {
  config?: string
  url?: string
  offset?: string
  mode?: string
  label?: string
  driver?: string
  video: string
  output: string
  style: string
  outputResolution?: string
  overlayX: string
  overlayY: string
  boxPosition?: string
  qualifyingTablePosition?: string
  labelWindow?: string
  noCache?: boolean
  onlyRenderOverlay?: boolean
}

program
  .command('render')
  .description('Render overlay onto video')
  .option('--config <path>', 'Path to JSON session config file')
  .option('--url <url>', 'Session URL (inline single-segment)')
  .option('--mode <mode>', 'Session mode for inline segment: practice, qualifying, or race')
  .option('--offset <time>', 'Video timestamp at session start, e.g. 0:02:15.500 or 12345 F (inline single-segment)')
  .option('--label <text>', 'Segment label shown around offset (inline single-segment)')
  .option('--driver <name>', 'Driver name (partial, case-insensitive)')
  .requiredOption('--video <path>', 'Source video file path')
  .option('--output <path>', 'Output file path', './out.mp4')
  .option('--style <name>', 'Overlay style', 'banner')
  .option('--output-resolution <preset>', 'Output resolution preset: 1080p, 1440p, or 2160p')
  .option('--overlay-x <n>', 'Overlay X position in pixels', '0')
  .option('--overlay-y <n>', 'Overlay Y position in pixels', '0')
  .option('--box-position <pos>', 'Position for esports/minimal/modern: bottom-left, bottom-center, bottom-right, top-left, top-center, top-right')
  .option('--qualifying-table-position <pos>', 'Corner for qualifying table: bottom-left, bottom-right, top-left, top-right')
  .option('--label-window <seconds>', 'Seconds before/after segment offset to show label', DEFAULT_LABEL_WINDOW_SECONDS.toString())
  .option('--no-cache', 'Force re-render the overlay even if a cached file exists')
  .option('--only-render-overlay', 'Render the overlay file and skip compositing onto the video')
  .action(async (opts: RenderOpts) => {
    try {
      const requestedOutputResolution = resolveOutputResolutionPreset(opts.outputResolution)
      if (opts.boxPosition != null && !VALID_BOX_POSITIONS.includes(opts.boxPosition as BoxPosition)) {
        console.error(`Error: --box-position must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
        process.exit(1)
      }
      const qualifyingTablePositionRaw = opts.qualifyingTablePosition
      if (qualifyingTablePositionRaw != null && !VALID_TABLE_POSITIONS.includes(qualifyingTablePositionRaw as CornerPosition)) {
        console.error(`Error: --qualifying-table-position must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
        process.exit(1)
      }
      const qualifyingTablePosition = qualifyingTablePositionRaw as CornerPosition | undefined
      const labelWindowSeconds = parseFloat(opts.labelWindow ?? DEFAULT_LABEL_WINDOW_SECONDS.toString())
      if (isNaN(labelWindowSeconds) || labelWindowSeconds < 0) {
        console.error('Error: --label-window must be a non-negative number')
        process.exit(1)
      }

      const { segments: segmentConfigs, driverQuery, configBoxPosition, configTablePosition, styling } = await loadRenderConfig(opts)
      if (configBoxPosition != null && !VALID_BOX_POSITIONS.includes(configBoxPosition as BoxPosition)) {
        throw new Error(`config.boxPosition must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
      }
      if (configTablePosition != null && !VALID_TABLE_POSITIONS.includes(configTablePosition as CornerPosition)) {
        throw new Error(`config.qualifyingTablePosition must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
      }
      const boxPosition = (opts.boxPosition ?? configBoxPosition ?? defaultBoxPositionForStyle(opts.style)) as BoxPosition
      // CLI flags take precedence over config file values
      const resolvedTablePosition = (qualifyingTablePosition ?? configTablePosition) as CornerPosition | undefined

      // Validate all modes up front
      const validModes: SessionMode[] = ['practice', 'qualifying', 'race']
      for (const sc of segmentConfigs) {
        const normalised = sc.mode?.toLowerCase()
        if (!normalised || !validModes.includes(normalised as SessionMode)) {
          console.error(`Error: segment mode "${sc.mode}" must be one of: ${validModes.join(', ')}`)
          process.exit(1)
        }
      }

      // Resolve video: if a directory, prompt the user to select files
      const selectedFiles = await resolveVideoFiles(opts.video)
      let videoPath = selectedFiles[0]
      let tempJoinedVideo: string | null = null
      if (selectedFiles.length > 1) {
        tempJoinedVideo = path.join(tmpdir(), `racedash-joined-${randomUUID()}.mp4`)
        process.stderr.write(`\n  Joining ${selectedFiles.length} files...\n`)
        await joinVideos(selectedFiles, tempJoinedVideo)
        videoPath = tempJoinedVideo
      }

      process.stderr.write('\n  Fetching session data and probing video...\n')

      const [durationSeconds, videoResolution, fps] = await Promise.all([
        getVideoDuration(videoPath),
        getVideoResolution(videoPath),
        getVideoFps(videoPath),
      ])
      const outputResolution = requestedOutputResolution ?? videoResolution
      const frameDuration = 1 / fps
      // Parse and snap each segment's offset
      const rawOffsets = segmentConfigs.map(sc => parseOffset(sc.offset, fps))
      const resolvedPositionOverrides = segmentConfigs.map((sc, i) =>
        resolvePositionOverrides(sc.positionOverrides, rawOffsets[i], i, fps),
      )
      const snappedOffsets = rawOffsets.map(raw => {
        const snapped = Math.round(Math.round(raw / frameDuration) * frameDuration * 1e6) / 1e6
        return snapped
      })

      // Fetch all segment HTMLs + race grid + video metadata in parallel
      const raceSegmentIndices = segmentConfigs
        .map((sc, i) => (sc.mode.toLowerCase() === 'race' ? i : -1))
        .filter(i => i >= 0)

      const N = segmentConfigs.length
      const R = raceSegmentIndices.length

      const fetchResults = await Promise.all([
        ...segmentConfigs.map(sc => fetchHtml(sc.url)),
        ...raceSegmentIndices.map(i => fetchGridHtml(segmentConfigs[i].url)),
        ...raceSegmentIndices.map(i => fetchReplayHtml(segmentConfigs[i].url).then(parseReplayLapData)),
      ])

      const htmls         = fetchResults.slice(0, N) as string[]
      const gridHtmls     = fetchResults.slice(N, N + R) as string[]
      const replayDataArr = fetchResults.slice(N + R) as ReplayLapData[]

      // Build SessionSegment[] — find driver in each segment independently
      const segments: SessionSegment[] = []
      let startingGridPosition: number | undefined

      for (let i = 0; i < segmentConfigs.length; i++) {
        const sc = segmentConfigs[i]
        const mode = sc.mode.toLowerCase() as SessionMode
        const html = htmls[i]
        const offsetSeconds = snappedOffsets[i]

        const allDrivers = parseDrivers(html)
        // Driver matching: partial, case-insensitive; error on 0 or 2+ matches
        const matches = allDrivers.filter(d =>
          d.name.toLowerCase().includes(driverQuery.toLowerCase()),
        )
        if (matches.length === 0) {
          console.error(`Error: no driver matching "${driverQuery}" found in segment ${i + 1} (${sc.url})`)
          process.exit(1)
        }
        if (matches.length > 1) {
          console.error(
            `Error: "${driverQuery}" is ambiguous in segment ${i + 1}. Matches:\n` +
              matches.map(d => `  [${d.kart}] ${d.name}`).join('\n'),
          )
          process.exit(1)
        }
        const driver = matches[0]
        const timestamps = calculateTimestamps(driver.laps, offsetSeconds)

        const session: SessionData = {
          driver: { kart: driver.kart, name: driver.name },
          laps: driver.laps,
          timestamps,
        }

        // Grid position from first race segment
        if (mode === 'race' && startingGridPosition === undefined) {
          const raceIdx = raceSegmentIndices.indexOf(i)
          if (raceIdx >= 0 && gridHtmls[raceIdx]) {
            const grid = parseGrid(gridHtmls[raceIdx])
            const entry = grid.find(e => e.kart === driver.kart)
            if (entry) startingGridPosition = entry.position
            else process.stderr.write(`\n  ⚠  kart ${driver.kart} not found in starting grid\n`)
          }
        }

        const rawOffset = rawOffsets[i]
        const snapped = snappedOffsets[i]
        const offsetSnapped = Math.abs(snapped - rawOffset) >= 0.0001

        stat(`Segment ${i + 1}`, `[${mode}]  ${driver.name}  [${driver.kart}]  ·  ${driver.laps.length} laps`)
        if (offsetSnapped) {
          stat('  Offset', `${formatOffsetTime(rawOffset)} → ${formatOffsetTime(snapped)}  (snapped)`)
        } else {
          stat('  Offset', formatOffsetTime(snapped))
        }
        if (sc.label) stat('  Label', sc.label)

        let raceLapSnapshots: RaceLapSnapshot[] | undefined
        if (mode === 'race') {
          const raceIdx = raceSegmentIndices.indexOf(i)
          if (raceIdx >= 0 && replayDataArr[raceIdx]) {
            raceLapSnapshots = buildRaceLapSnapshots(replayDataArr[raceIdx], snappedOffsets[i])
            if (raceLapSnapshots.length === 0) {
              process.stderr.write(`Warning: no valid race lap snapshots for segment ${i}\n`)
            }
          }
        }

        segments.push({
          mode,
          session,
          sessionAllLaps: allDrivers.map(d => d.laps),
          leaderboardDrivers: mode === 'race'
            ? buildRaceDrivers(allDrivers, offsetSeconds)
            : buildLeaderboardDrivers(allDrivers, driver.kart, offsetSeconds),
          label: sc.label,
          positionOverrides: resolvedPositionOverrides[i],
          raceLapSnapshots,
        })
      }

      const durationInFrames = Math.ceil(durationSeconds * fps)

      process.stderr.write('\n')
      stat('Video', `${videoResolution.width}×${videoResolution.height}  ·  ${formatFps(fps)} fps`)
      if (requestedOutputResolution != null) {
        stat('Output', `${outputResolution.width}×${outputResolution.height}  ·  ${requestedOutputResolution.preset}`)
      }
      if (startingGridPosition != null) stat('Grid', `P${startingGridPosition}`)
      stat('Style', opts.style)
      printStyling(styling, opts.style)

      const overlayProps: OverlayProps = {
        segments,
        startingGridPosition,
        fps,
        durationInFrames,
        videoWidth: outputResolution.width,
        videoHeight: outputResolution.height,
        boxPosition,
        qualifyingTablePosition: resolvedTablePosition,
        styling,
        labelWindowSeconds,
      }

      const rendererEntry = path.resolve(__dirname, '../../../apps/renderer/src/index.ts')
      const overlayPath = opts.output.replace(/\.[^.]+$/, '-overlay.mov')
      const workStart = Date.now()

      let overlayReused = false
      if (!opts.noCache) {
        try {
          await access(overlayPath)
          const overlayDuration = await getVideoDuration(overlayPath)
          overlayReused = overlayDuration > 0
        } catch { /* no valid overlay on disk */ }
      }

      if (overlayReused) {
        process.stderr.write(`  Reusing overlay        ${overlayPath}\n`)
      } else {
        try {
          await renderOverlay(rendererEntry, opts.style, overlayProps, overlayPath, makeProgressCallback('Rendering overlay'))
        } finally {
          process.stderr.write('\n')
        }
      }

      if (opts.onlyRenderOverlay) {
        const totalSeconds = Math.round((Date.now() - workStart) / 1000)
        process.stderr.write(`\n  ✓  ${overlayPath}  ·  ${formatSeconds(totalSeconds)}\n\n`)
        console.log(overlayPath)
        if (tempJoinedVideo) await unlink(tempJoinedVideo).catch(() => {})
        return
      }

      const overlayX = parseInt(opts.overlayX, 10)
      let overlayY = parseInt(opts.overlayY, 10)
      if (isNaN(overlayX) || isNaN(overlayY)) {
        console.error('Error: --overlay-x and --overlay-y must be valid integers')
        process.exit(1)
      }

      const BOX_STRIP_HEIGHTS: Partial<Record<string, number>> = { esports: 400, minimal: 400 }
      const stripHeight = BOX_STRIP_HEIGHTS[opts.style]
      if (stripHeight != null) {
        const scaledStrip = Math.round(stripHeight * outputResolution.width / 1920)
        overlayY = boxPosition.startsWith('bottom') ? outputResolution.height - scaledStrip : 0
      }

      try {
        await compositeVideo(
          videoPath,
          overlayPath,
          opts.output,
          {
            fps,
            overlayX,
            overlayY,
            durationSeconds,
            outputWidth: requestedOutputResolution?.width,
            outputHeight: requestedOutputResolution?.height,
          },
          makeProgressCallback('Compositing'),
        )
      } finally {
        process.stderr.write('\n')
        if (tempJoinedVideo) await unlink(tempJoinedVideo).catch(() => {})
      }

      const totalSeconds = Math.round((Date.now() - workStart) / 1000)
      process.stderr.write(`\n  ✓  ${opts.output}  ·  ${formatSeconds(totalSeconds)}\n\n`)
      console.log(opts.output)
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

const BAR_WIDTH = 30

function progressBar(progress: number): string {
  const filled = Math.round(progress * BAR_WIDTH)
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

function formatOffsetTime(seconds: number): string {
  const abs = Math.abs(seconds)
  const sign = seconds < 0 ? '-' : ''
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  const sStr = s.toFixed(3).padStart(6, '0')
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${sStr}`
  return `${sign}${m}:${sStr}`
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatFps(fps: number): string {
  return fps.toFixed(3).replace(/\.?0+$/, '')
}

function stat(label: string, value: string): void {
  process.stderr.write(`  ${label.padEnd(10)}  ${value}\n`)
}

function tryParseColor(css: string): [number, number, number] | null {
  const s = css.trim()
  const hex = s.match(/^#([0-9a-fA-F]{3,8})$/)
  if (hex) {
    const h = hex[1]
    if (h.length === 3) return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)]
    if (h.length >= 6)  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) return [parseInt(rgb[1]), parseInt(rgb[2]), parseInt(rgb[3])]
  const named: Record<string, [number, number, number]> = { white: [255,255,255], black: [0,0,0] }
  return named[s.toLowerCase()] ?? null
}

function colorSwatch(css: string): string {
  const rgb = tryParseColor(css)
  if (!rgb) return ''
  const [r, g, b] = rgb
  return `\x1b[48;2;${r};${g};${b}m  \x1b[0m `
}

function printStyling(styling: OverlayStyling | undefined, style: string): void {
  const lb = styling?.leaderboard
  const bn = styling?.banner
  const gb = styling?.geometricBanner
  const es = styling?.esports
  const mn = styling?.minimal
  const mo = styling?.modern
  const fd = styling?.fade
  const sl = styling?.segmentLabel
  const db = styling?.deltaBadge
  const W = 22

  const accent = styling?.accentColor ?? '#3DD73D'

  function row(indent: string, label: string, configured: string | undefined, dflt: string): void {
    const tag = configured !== undefined ? '' : ' (default)'
    const value = configured ?? dflt
    const swatch = colorSwatch(value)
    process.stderr.write(`${indent}${label.padEnd(W)}  ${swatch}${value}${tag}\n`)
  }

  function section(indent: string, name: string): void {
    process.stderr.write(`${indent}${name}\n`)
  }

  process.stderr.write(`  Styling\n`)
  row('    ', 'accentColor', styling?.accentColor, '#3DD73D')
  row('    ', 'textColor', styling?.textColor, 'white')

  section('    ', 'fade')
  row('      ', 'enabled', fd?.enabled?.toString(), DEFAULT_FADE_ENABLED.toString())
  row('      ', 'durationSeconds', fd?.durationSeconds?.toString(), DEFAULT_FADE_DURATION_SECONDS.toString())
  row('      ', 'preRollSeconds', fd?.preRollSeconds?.toString(), DEFAULT_FADE_PRE_ROLL_SECONDS.toString())

  section('    ', 'segmentLabel')
  row('      ', 'bgColor', sl?.bgColor, 'rgba(0,0,0,0.72)')
  row('      ', 'textColor', sl?.textColor, 'white')
  row('      ', 'borderRadius', sl?.borderRadius?.toString(), '8')

  section('    ', 'deltaBadge')
  row('      ', 'fasterColor', db?.fasterColor, '#00FF87')
  row('      ', 'slowerColor', db?.slowerColor, '#FF3B30')
  row('      ', 'fadeInDuration', db?.fadeInDuration?.toString(), '0.5')

  section('    ', 'leaderboard')
  row('      ', 'accentColor', lb?.accentColor, `${accent} (inherited)`)
  row('      ', 'bgColor', lb?.bgColor, 'rgba(0,0,0,0.65)')
  row('      ', 'ourRowBgColor', lb?.ourRowBgColor, 'rgba(0,0,0,0.82)')
  row('      ', 'ourRowBorderWidth', lb?.ourRowBorderWidth?.toString(), '3')
  row('      ', 'ourRowGradientOpacity', lb?.ourRowGradientOpacity?.toString(), '0.19')
  row('      ', 'backdropBlur', lb?.backdropBlur?.toString(), '8')
  row('      ', 'textColor', lb?.textColor, 'white')
  row('      ', 'positionTextColor', lb?.positionTextColor, 'rgba(255,255,255,0.5)')
  row('      ', 'kartTextColor', lb?.kartTextColor, 'rgba(255,255,255,0.7)')
  row('      ', 'lapTimeTextColor', lb?.lapTimeTextColor, 'rgba(255,255,255,0.8)')
  row('      ', 'separatorColor', lb?.separatorColor, 'rgba(255,255,255,0.15)')

  if (style === 'banner') {
    section('    ', 'banner')
    row('      ', 'bgColor', bn?.bgColor, `${accent} (inherited)`)
    row('      ', 'bgOpacity', bn?.bgOpacity?.toString(), '0.82')
    row('      ', 'borderRadius', bn?.borderRadius?.toString(), '10')
    row('      ', 'timerTextColor', bn?.timerTextColor, 'white')
    row('      ', 'timerBgColor', bn?.timerBgColor, '#111111')
    row('      ', 'lapColorPurple', bn?.lapColorPurple, 'rgba(107,33,168,0.95)')
    row('      ', 'lapColorGreen', bn?.lapColorGreen, 'rgba(21,128,61,0.95)')
    row('      ', 'lapColorRed', bn?.lapColorRed, 'rgba(185,28,28,0.95)')
    row('      ', 'flashDuration', bn?.flashDuration?.toString(), '2')
    row('      ', 'leftSegment', bn?.leftSegment, 'last-lap')
    row('      ', 'rightSegment', bn?.rightSegment, 'best-lap')
  }

  if (style === 'geometric-banner') {
    section('    ', 'geometricBanner')
    row('      ', 'positionCounterColor', gb?.positionCounterColor, '#0bc770')
    row('      ', 'lastLapColor', gb?.lastLapColor, '#16aa9c')
    row('      ', 'lapTimerNeutralColor', gb?.lapTimerNeutralColor, '#0e0ab8')
    row('      ', 'previousLapColor', gb?.previousLapColor, '#7c16aa')
    row('      ', 'lapCounterColor', gb?.lapCounterColor, '#c70b4d')
    row('      ', 'lapColorPurple', gb?.lapColorPurple, 'rgba(107,33,168,0.95)')
    row('      ', 'lapColorGreen', gb?.lapColorGreen, 'rgba(21,128,61,0.95)')
    row('      ', 'lapColorRed', gb?.lapColorRed, 'rgba(185,28,28,0.95)')
    row('      ', 'timerTextColor', gb?.timerTextColor, 'white')
    row('      ', 'flashDuration', gb?.flashDuration?.toString(), '2')
    row('      ', 'opacity', gb?.opacity?.toString(), '1')
    row('      ', 'leftSegment', gb?.leftSegment, 'last-lap')
    row('      ', 'rightSegment', gb?.rightSegment, 'best-lap')
  }

  if (style === 'esports') {
    section('    ', 'esports')
    row('      ', 'accentBarColor', es?.accentBarColor, '#2563eb')
    row('      ', 'accentBarColorEnd', es?.accentBarColorEnd, '#7c3aed')
    row('      ', 'timePanelsBgColor', es?.timePanelsBgColor, '#3f4755')
    row('      ', 'currentBarBgColor', es?.currentBarBgColor, '#111')
    row('      ', 'labelColor', es?.labelColor, '#9ca3af')
    row('      ', 'lastLapIconColor', es?.lastLapIconColor, '#16a34a')
    row('      ', 'sessionBestIconColor', es?.sessionBestIconColor, '#7c3aed')
  }

  if (style === 'minimal') {
    section('    ', 'minimal')
    row('      ', 'bgColor', mn?.bgColor, 'rgba(20,22,28,0.88)')
    row('      ', 'badgeBgColor', mn?.badgeBgColor, 'white')
    row('      ', 'badgeTextColor', mn?.badgeTextColor, '#222222')
    row('      ', 'statLabelColor', mn?.statLabelColor, '#aaaaaa')
  }

  if (style === 'modern') {
    section('    ', 'modern')
    row('      ', 'bgColor', mo?.bgColor, 'rgba(13,15,20,0.88)')
    row('      ', 'stripeOpacity', mo?.stripeOpacity?.toString(), '0.035')
    row('      ', 'dividerColor', mo?.dividerColor, 'rgba(255,255,255,0.2)')
    row('      ', 'statLabelColor', mo?.statLabelColor, 'rgba(255,255,255,0.5)')
  }
}


function makeProgressCallback(label: string): (progress: number) => void {
  const tag = label.padEnd(16)
  const wallStart = Date.now()

  // Sliding window rate estimation: sample progress every SAMPLE_MS,
  // keep the last WINDOW samples. Rate = (newest - oldest) / time span.
  // This adapts to recent speed without being dominated by early fast/slow
  // startup periods, and only updates ETA once per second to avoid jitter.
  const SAMPLE_MS = 1000
  const WINDOW = 10
  const samples: Array<[number, number]> = [] // [timestamp ms, progress]
  let lastSampleTime = 0
  let etaStr = ''

  return (progress: number) => {
    const now = Date.now()
    const pct = `${Math.round(progress * 100)}%`.padStart(4)
    const bar = progressBar(progress)
    const et = formatSeconds(Math.round((now - wallStart) / 1000))

    if (progress > 0.001 && progress < 0.999) {
      if (now - lastSampleTime >= SAMPLE_MS) {
        samples.push([now, progress])
        if (samples.length > WINDOW) samples.shift()
        lastSampleTime = now

        if (samples.length >= 2) {
          const [t0, p0] = samples[0]
          const [tN, pN] = samples[samples.length - 1]
          const rate = (pN - p0) / ((tN - t0) / 1000)
          if (rate > 0) {
            const remaining = (1 - progress) / rate
            etaStr = `  ETA ${formatSeconds(Math.round(remaining))}`
          }
        }
      }
    } else if (progress >= 0.999) {
      etaStr = ''
    }

    process.stderr.write(`\r  ${tag}  [${bar}]  ${pct}  ET ${et}${etaStr}   `)
  }
}

interface SegmentConfig {
  mode: string
  url: string
  offset: string
  label?: string
  positionOverrides?: PositionOverrideConfig[]
}

interface ResolvedSegmentConfig {
  mode: string
  url: string
  offset: string
  label?: string
  positionOverrides?: PositionOverrideConfig[]
}

interface RenderConfig {
  segments: SegmentConfig[]
  driver?: string
  boxPosition?: string
  qualifyingTablePosition?: string
  styling?: OverlayStyling
}

interface LoadedConfig {
  segments: ResolvedSegmentConfig[]
  driverQuery: string
  configBoxPosition?: string
  configTablePosition?: string
  styling?: OverlayStyling
}

async function loadRenderConfig(opts: RenderOpts): Promise<LoadedConfig> {
  if (opts.config) {
    const raw = JSON.parse(await readFile(opts.config, 'utf8'))
    const config = raw as RenderConfig
    if (!Array.isArray(config.segments) || config.segments.length === 0) {
      throw new Error('Config file must contain a non-empty "segments" array')
    }
    for (let i = 0; i < config.segments.length; i++) {
      const s = config.segments[i]
      if (typeof s.url    !== 'string' || !s.url)    throw new Error(`segments[${i}] is missing "url"`)
      if (typeof s.mode   !== 'string' || !s.mode)   throw new Error(`segments[${i}] is missing "mode"`)
      if (typeof s.offset !== 'string' || !s.offset) throw new Error(`segments[${i}] is missing "offset"`)
    }
    const driverQuery = opts.driver ?? config.driver
    if (!driverQuery) throw new Error('--driver is required (or set "driver" in config file)')
    return {
      segments: config.segments.map((segment, i) => ({
        ...segment,
        positionOverrides: validatePositionOverrideConfig(segment.positionOverrides, segment.mode, i),
      })),
      driverQuery,
      configBoxPosition: config.boxPosition,
      configTablePosition: config.qualifyingTablePosition,
      styling: config.styling,
    }
  }

  // Inline single-segment
  if (!opts.url || !opts.mode || !opts.offset) {
    throw new Error('Provide --config <path> or all of --url, --mode, and --offset for a single segment')
  }
  if (!opts.driver) throw new Error('--driver is required')
  return {
    segments: [{
      mode: opts.mode,
      url: opts.url,
      offset: opts.offset,
      label: opts.label,
    }],
    driverQuery: opts.driver,
  }
}

if (require.main === module) {
  program.parseAsync(process.argv).catch((err: Error) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
