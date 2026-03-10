#!/usr/bin/env node
import { program } from 'commander'
import { fetchHtml, fetchGridHtml, parseDrivers, parseGrid } from '@racedash/scraper'
import { parseOffset, calculateTimestamps, formatChapters } from '@racedash/timestamps'
import { selectDriver } from './select'
import path from 'node:path'
import { access } from 'node:fs/promises'
import { compositeVideo, getVideoDuration, getVideoResolution, renderOverlay, joinVideos } from '@racedash/compositor'
import type { BoxPosition, OverlayProps, SessionData, SessionMode } from '@racedash/core'

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
  offset: string
  video: string
  output: string
  fps: string
  style: string
  overlayX: string
  overlayY: string
  mode: string
  boxPosition: string
  accentColor?: string
  textColor?: string
  timerTextColor?: string
  timerBgColor?: string
}

program
  .command('render <url> [driver]')
  .description('Render geometric overlay onto video')
  .requiredOption('--offset <time>', 'Video timestamp at race start, e.g. 0:02:15')
  .requiredOption('--video <path>', 'Source video file path')
  .option('--output <path>', 'Output file path', './out.mp4')
  .option('--fps <n>', 'Output framerate', '60')
  .option('--style <name>', 'Overlay style', 'banner')
  .option('--overlay-x <n>', 'Overlay X position in pixels', '0')
  .option('--overlay-y <n>', 'Overlay Y position in pixels', '0')
  .option('--mode <mode>', 'Session mode: practice, qualifying, or race')
  .option('--box-position <pos>', 'Box corner for esports/minimal: bottom-left, bottom-right, top-left, top-right', 'bottom-left')
  .option('--accent-color <color>', 'Accent color for the overlay style (CSS color or hex, e.g. #3DD73D)')
  .option('--text-color <color>', 'Text color for the overlay (CSS color or hex, default: white)')
  .option('--timer-text-color <color>', 'Text color for the lap timer (default: white)')
  .option('--timer-bg-color <color>', 'Background color for the lap timer (default: #111111)')
  .action(async (url: string, driverQuery: string | undefined, opts: RenderOpts) => {
    try {
      const fps = parseInt(opts.fps, 10)
      if (isNaN(fps)) {
        console.error('Error: --fps must be a valid integer')
        process.exit(1)
      }
      const validModes: SessionMode[] = ['practice', 'qualifying', 'race']
      const normalised = opts.mode?.toLowerCase()
      if (!normalised || !validModes.includes(normalised as SessionMode)) {
        console.error(`Error: --mode must be one of: ${validModes.join(', ')}`)
        process.exit(1)
      }
      const mode = normalised as SessionMode

      const validBoxPositions: BoxPosition[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right']
      if (!validBoxPositions.includes(opts.boxPosition as BoxPosition)) {
        console.error(`Error: --box-position must be one of: ${validBoxPositions.join(', ')}`)
        process.exit(1)
      }
      const boxPosition = opts.boxPosition as BoxPosition
      const rawOffsetSeconds = parseOffset(opts.offset)
      const frameDuration = 1 / fps
      // Snap to nearest frame, then strip floating-point drift
      const offsetSeconds = Math.round(Math.round(rawOffsetSeconds / frameDuration) * frameDuration * 1e6) / 1e6
      const offsetSnapped = Math.abs(offsetSeconds - rawOffsetSeconds) >= 0.0001

      process.stderr.write('\n  Fetching session data and probing video...\n')
      const [html, gridHtml, durationSeconds, videoResolution] = await Promise.all([
        fetchHtml(url),
        mode === 'race' ? fetchGridHtml(url) : Promise.resolve(null),
        getVideoDuration(opts.video),
        getVideoResolution(opts.video),
      ])
      const durationInFrames = Math.ceil(durationSeconds * fps)

      const drivers = parseDrivers(html)
      const driver = await selectDriver(drivers, driverQuery)
      const timestamps = calculateTimestamps(driver.laps, offsetSeconds)

      let startingGridPosition: number | undefined
      if (gridHtml) {
        const grid = parseGrid(gridHtml)
        const gridEntry = grid.find(e => e.kart === driver.kart)
        if (gridEntry) {
          startingGridPosition = gridEntry.position
        } else {
          process.stderr.write(`\n  ⚠  kart ${driver.kart} not found in starting grid\n`)
        }
      }

      const session: SessionData = {
        driver: { kart: driver.kart, name: driver.name },
        laps: driver.laps,
        timestamps,
      }

      const resolvedAccent      = opts.accentColor    ?? '#3DD73D'
      const resolvedText        = opts.textColor      ?? 'white'
      const resolvedTimerText   = opts.timerTextColor ?? resolvedText
      const resolvedTimerBg     = opts.timerBgColor   ?? '#111111'

      process.stderr.write('\n')
      stat('Driver',      `${driver.name}  [${driver.kart}]  ·  ${driver.laps.length} laps`)
      stat('Mode',        mode)
      if (startingGridPosition != null) stat('Grid', `P${startingGridPosition}`)
      stat('Video',       `${videoResolution.width}×${videoResolution.height}  ·  ${fps} fps`)
      if (offsetSnapped) {
        stat('Offset', `${formatOffsetTime(rawOffsetSeconds)} → ${formatOffsetTime(offsetSeconds)}  (snapped to nearest frame)`)
      } else {
        stat('Offset', formatOffsetTime(offsetSeconds))
      }
      stat('Style',       opts.style)
      stat('Accent',      `${colorSwatch(resolvedAccent)}${resolvedAccent}`)
      stat('Text',        `${colorSwatch(resolvedText)}${resolvedText}`)
      stat('Timer text',  `${colorSwatch(resolvedTimerText)}${resolvedTimerText}`)
      stat('Timer bg',    `${colorSwatch(resolvedTimerBg)}${resolvedTimerBg}`)
      process.stderr.write('\n')

      const overlayProps: OverlayProps = {
        session,
        sessionAllLaps: drivers.map(d => d.laps),
        mode,
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
      }

      // Resolves to apps/renderer/src/index.ts from apps/cli/dist/ at runtime.
      // This only works when run from within the monorepo working tree (dev use).
      const rendererEntry = path.resolve(
        __dirname,
        '../../../apps/renderer/src/index.ts',
      )
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

      // Box-style overlays render a short strip (not full-height canvas) to avoid wasting
      // Chromium rendering time on transparent pixels. Auto-calculate the vertical offset
      // so bottom-anchored boxes land at the correct position in the video.
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
  let lastProgress = 0
  let lastTime = Date.now()
  let smoothedRate = 0   // EMA of progress-per-second
  let etaStr = ''

  return (progress: number) => {
    const now = Date.now()
    const pct = `${Math.round(progress * 100)}%`.padStart(4)
    const bar = progressBar(progress)

    if (progress > 0.001 && progress < 0.999) {
      const dt = (now - lastTime) / 1000
      if (dt > 0) {
        const instantRate = (progress - lastProgress) / dt
        // EMA: weight recent samples lightly so the estimate stabilises quickly
        // but doesn't overreact to individual fast/slow ticks
        smoothedRate = smoothedRate === 0
          ? instantRate
          : 0.05 * instantRate + 0.95 * smoothedRate
      }
      if (smoothedRate > 0) {
        const remaining = Math.max(0, (1 - progress) / smoothedRate)
        etaStr = `  ETA ${formatSeconds(Math.round(remaining))}`
      }
    } else if (progress >= 0.999) {
      etaStr = ''
    }

    lastProgress = progress
    lastTime = now
    process.stderr.write(`\r  ${tag}  [${bar}]  ${pct}${etaStr}   `)
  }
}

program.parseAsync(process.argv).catch((err: Error) => {
  console.error('Error:', err.message)
  process.exit(1)
})
