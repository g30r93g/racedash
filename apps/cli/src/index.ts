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
import { compositeVideo, getVideoDuration, getVideoResolution, renderOverlay, joinVideos } from '@racedash/compositor'
import type { BoxPosition, LapTimestamp, OverlayProps, LeaderboardDriver, SessionData, SessionMode, SessionSegment, RaceLapEntry, RaceLapSnapshot, OverlayStyling } from '@racedash/core'

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
  .requiredOption('--offset <time>', 'Video timestamp at race start, e.g. 0:02:15')
  .action(async (url: string, driverQuery: string | undefined, opts: { offset: string }) => {
    try {
      const offsetSeconds = parseOffset(opts.offset)
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
  fps: string
  style: string
  overlayX: string
  overlayY: string
  boxPosition: string
  qualifyingTablePosition?: string
  labelWindow?: string
}

program
  .command('render')
  .description('Render overlay onto video')
  .option('--config <path>', 'Path to JSON session config file')
  .option('--url <url>', 'Session URL (inline single-segment)')
  .option('--mode <mode>', 'Session mode for inline segment: practice, qualifying, or race')
  .option('--offset <time>', 'Video timestamp at session start, e.g. 0:02:15.500 (inline single-segment)')
  .option('--label <text>', 'Segment label shown around offset (inline single-segment)')
  .option('--driver <name>', 'Driver name (partial, case-insensitive)')
  .requiredOption('--video <path>', 'Source video file path')
  .option('--output <path>', 'Output file path', './out.mp4')
  .option('--fps <n>', 'Output framerate', '60')
  .option('--style <name>', 'Overlay style', 'banner')
  .option('--overlay-x <n>', 'Overlay X position in pixels', '0')
  .option('--overlay-y <n>', 'Overlay Y position in pixels', '0')
  .option('--box-position <pos>', 'Box corner for esports/minimal: bottom-left, bottom-right, top-left, top-right', 'bottom-left')
  .option('--qualifying-table-position <pos>', 'Corner for qualifying table: bottom-left, bottom-right, top-left, top-right')
  .option('--label-window <seconds>', 'Seconds before/after segment offset to show label', '5')
  .action(async (opts: RenderOpts) => {
    try {
      const fps = parseInt(opts.fps, 10)
      if (isNaN(fps)) {
        console.error('Error: --fps must be a valid integer')
        process.exit(1)
      }
      const validBoxPositions: BoxPosition[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
      if (!validBoxPositions.includes(opts.boxPosition as BoxPosition)) {
        console.error(`Error: --box-position must be one of: ${validBoxPositions.join(', ')}`)
        process.exit(1)
      }
      const boxPosition = opts.boxPosition as BoxPosition
      const qualifyingTablePositionRaw = opts.qualifyingTablePosition
      if (qualifyingTablePositionRaw != null && !validBoxPositions.includes(qualifyingTablePositionRaw as BoxPosition)) {
        console.error(`Error: --qualifying-table-position must be one of: ${validBoxPositions.join(', ')}`)
        process.exit(1)
      }
      const qualifyingTablePosition = qualifyingTablePositionRaw as BoxPosition | undefined
      const labelWindowSeconds = parseFloat(opts.labelWindow ?? '5')
      if (isNaN(labelWindowSeconds) || labelWindowSeconds < 0) {
        console.error('Error: --label-window must be a non-negative number')
        process.exit(1)
      }
      const frameDuration = 1 / fps

      const { segments: segmentConfigs, driverQuery, configTablePosition, styling } = await loadRenderConfig(opts)
      // CLI flags take precedence over config file values
      const resolvedTablePosition = qualifyingTablePosition ?? configTablePosition

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

      // Parse and snap each segment's offset
      const rawOffsets = segmentConfigs.map(sc => parseOffset(sc.offset))
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

      const [[durationSeconds, videoResolution], fetchResults] = await Promise.all([
        Promise.all([getVideoDuration(videoPath), getVideoResolution(videoPath)]),
        Promise.all([
          ...segmentConfigs.map(sc => fetchHtml(sc.url)),
          ...raceSegmentIndices.map(i => fetchGridHtml(segmentConfigs[i].url)),
          ...raceSegmentIndices.map(i => fetchReplayHtml(segmentConfigs[i].url).then(parseReplayLapData)),
        ]),
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
          raceLapSnapshots,
        })
      }

      const durationInFrames = Math.ceil(durationSeconds * fps)

      process.stderr.write('\n')
      stat('Video', `${videoResolution.width}×${videoResolution.height}  ·  ${fps} fps`)
      if (startingGridPosition != null) stat('Grid', `P${startingGridPosition}`)
      stat('Style', opts.style)

      const overlayProps: OverlayProps = {
        segments,
        startingGridPosition,
        fps,
        durationInFrames,
        videoWidth: videoResolution.width,
        videoHeight: videoResolution.height,
        boxPosition,
        qualifyingTablePosition: resolvedTablePosition,
        styling,
        labelWindowSeconds,
      }

      const rendererEntry = path.resolve(__dirname, '../../../apps/renderer/src/index.ts')
      const overlayPath = opts.output.replace(/\.[^.]+$/, '-overlay.mov')
      const workStart = Date.now()

      let overlayReused = false
      try {
        await access(overlayPath)
        const overlayDuration = await getVideoDuration(overlayPath)
        overlayReused = overlayDuration > 0
      } catch { /* no valid overlay on disk */ }

      if (overlayReused) {
        process.stderr.write(`  Reusing overlay        ${overlayPath}\n`)
      } else {
        try {
          await renderOverlay(rendererEntry, opts.style, overlayProps, overlayPath, makeProgressCallback('Rendering overlay'))
        } finally {
          process.stderr.write('\n')
        }
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
        const scaledStrip = Math.round(stripHeight * videoResolution.width / 1920)
        overlayY = boxPosition.startsWith('bottom') ? videoResolution.height - scaledStrip : 0
      }

      try {
        await compositeVideo(
          videoPath,
          overlayPath,
          opts.output,
          { fps, overlayX, overlayY, durationSeconds },
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

function stat(label: string, value: string): void {
  process.stderr.write(`  ${label.padEnd(10)}  ${value}\n`)
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
}

interface RenderConfig {
  segments: SegmentConfig[]
  driver?: string
  qualifyingTablePosition?: BoxPosition
  styling?: OverlayStyling
}

interface LoadedConfig {
  segments: SegmentConfig[]
  driverQuery: string
  configTablePosition?: BoxPosition
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
      segments: config.segments,
      driverQuery,
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
    segments: [{ mode: opts.mode, url: opts.url, offset: opts.offset, label: opts.label }],
    driverQuery: opts.driver,
  }
}

program.parseAsync(process.argv).catch((err: Error) => {
  console.error('Error:', err.message)
  process.exit(1)
})
