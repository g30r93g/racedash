#!/usr/bin/env node
import { program } from 'commander'
import { fetchHtml, fetchGridHtml, parseDrivers, parseGrid } from '@racedash/scraper'
import { parseOffset, calculateTimestamps, formatChapters } from '@racedash/timestamps'
import { selectDriver } from './select'
import path from 'node:path'
import { access, readFile } from 'node:fs/promises'
import { compositeVideo, getVideoDuration, getVideoResolution, renderOverlay, joinVideos } from '@racedash/compositor'
import type { BoxPosition, OverlayProps, SessionData, SessionMode, SessionSegment } from '@racedash/core'

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
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
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
  .option('--accent-color <color>', 'Accent color (CSS color or hex, e.g. #3DD73D)')
  .option('--text-color <color>', 'Text color for the overlay (default: white)')
  .option('--timer-text-color <color>', 'Text color for the lap timer (default: white)')
  .option('--timer-bg-color <color>', 'Background color for the lap timer (default: #111111)')
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
      const labelWindowSeconds = parseFloat(opts.labelWindow ?? '5')
      if (isNaN(labelWindowSeconds) || labelWindowSeconds < 0) {
        console.error('Error: --label-window must be a non-negative number')
        process.exit(1)
      }
      const frameDuration = 1 / fps

      const { segments: segmentConfigs, driverQuery } = await loadRenderConfig(opts)

      // Validate all modes up front
      const validModes: SessionMode[] = ['practice', 'qualifying', 'race']
      for (const sc of segmentConfigs) {
        const normalised = sc.mode?.toLowerCase()
        if (!normalised || !validModes.includes(normalised as SessionMode)) {
          console.error(`Error: segment mode "${sc.mode}" must be one of: ${validModes.join(', ')}`)
          process.exit(1)
        }
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

      const [[durationSeconds, videoResolution], fetchResults] = await Promise.all([
        Promise.all([getVideoDuration(opts.video), getVideoResolution(opts.video)]),
        Promise.all([
          ...segmentConfigs.map(sc => fetchHtml(sc.url)),
          ...raceSegmentIndices.map(i => fetchGridHtml(segmentConfigs[i].url)),
        ]),
      ])

      const htmls     = fetchResults.slice(0, segmentConfigs.length)
      const gridHtmls = fetchResults.slice(segmentConfigs.length)

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

        segments.push({
          mode,
          session,
          sessionAllLaps: allDrivers.map(d => d.laps),
          label: sc.label,
        })
      }

      const durationInFrames = Math.ceil(durationSeconds * fps)

      process.stderr.write('\n')
      stat('Video', `${videoResolution.width}×${videoResolution.height}  ·  ${fps} fps`)
      if (startingGridPosition != null) stat('Grid', `P${startingGridPosition}`)
      stat('Style', opts.style)
      const resolvedAccent    = opts.accentColor    ?? '#3DD73D'
      const resolvedText      = opts.textColor      ?? 'white'
      const resolvedTimerText = opts.timerTextColor ?? resolvedText
      const resolvedTimerBg   = opts.timerBgColor   ?? '#111111'
      stat('Accent',      `${colorSwatch(resolvedAccent)}${resolvedAccent}`)
      stat('Text',        `${colorSwatch(resolvedText)}${resolvedText}`)
      stat('Timer text',  `${colorSwatch(resolvedTimerText)}${resolvedTimerText}`)
      stat('Timer bg',    `${colorSwatch(resolvedTimerBg)}${resolvedTimerBg}`)
      process.stderr.write('\n')

      const overlayProps: OverlayProps = {
        segments,
        startingGridPosition,
        fps,
        durationInFrames,
        videoWidth: videoResolution.width,
        videoHeight: videoResolution.height,
        boxPosition,
        accentColor: opts.accentColor,
        textColor: opts.textColor,
        timerTextColor: opts.timerTextColor,
        timerBgColor: opts.timerBgColor,
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

      const BOX_STRIP_HEIGHTS: Partial<Record<string, number>> = { esports: 250, minimal: 190 }
      const stripHeight = BOX_STRIP_HEIGHTS[opts.style]
      if (stripHeight != null) {
        const scaledStrip = Math.round(stripHeight * videoResolution.width / 1920)
        overlayY = boxPosition.startsWith('bottom') ? videoResolution.height - scaledStrip : 0
      }

      try {
        await compositeVideo(
          opts.video,
          overlayPath,
          opts.output,
          { fps, overlayX, overlayY, durationSeconds },
          makeProgressCallback('Compositing'),
        )
      } finally {
        process.stderr.write('\n')
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

// Named CSS colours → hex (covers the most likely values users would pass)
const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000',
  lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500',
  purple: '#800080', cyan: '#00ffff', magenta: '#ff00ff', pink: '#ffc0cb',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', gold: '#ffd700',
}

function parseColor(color: string): [number, number, number] | null {
  const hex = NAMED_COLORS[color.toLowerCase()] ?? color
  const m6 = hex.match(/^#([0-9a-f]{6})$/i)
  if (m6) {
    const n = parseInt(m6[1], 16)
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  }
  const m3 = hex.match(/^#([0-9a-f]{3})$/i)
  if (m3) {
    return m3[1].split('').map(c => parseInt(c + c, 16)) as [number, number, number]
  }
  return null
}

function colorSwatch(color: string): string {
  const rgb = parseColor(color)
  if (!rgb) return ''
  const [r, g, b] = rgb
  return `\x1b[48;2;${r};${g};${b}m  \x1b[0m `
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
}

async function loadRenderConfig(opts: RenderOpts): Promise<{ segments: SegmentConfig[]; driverQuery: string }> {
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
    return { segments: config.segments, driverQuery }
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
