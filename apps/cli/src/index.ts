#!/usr/bin/env node
import { program } from 'commander'
import { fetchHtml, parseDrivers } from '@racedash/scraper'
import { parseOffset, calculateTimestamps, formatChapters } from '@racedash/timestamps'
import { selectDriver } from './select'
import path from 'node:path'
import { compositeVideo, getVideoDuration, renderOverlay, joinVideos } from '@racedash/compositor'
import type { OverlayProps, SessionData } from '@racedash/core'

program
  .name('racedash')
  .description('Alpha Timing → YouTube chapters + GT7 overlay')
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
}

program
  .command('render <url> [driver]')
  .description('Render GT7-style overlay onto video')
  .requiredOption('--offset <time>', 'Video timestamp at race start, e.g. 0:02:15')
  .requiredOption('--video <path>', 'Source video file path')
  .option('--output <path>', 'Output file path', './out.mp4')
  .option('--fps <n>', 'Output framerate', '60')
  .option('--style <name>', 'Overlay style', 'gt7')
  .option('--overlay-x <n>', 'Overlay X position in pixels', '0')
  .option('--overlay-y <n>', 'Overlay Y position in pixels', '0')
  .action(async (url: string, driverQuery: string | undefined, opts: RenderOpts) => {
    try {
      const fps = parseInt(opts.fps, 10)
      if (isNaN(fps)) {
        console.error('Error: --fps must be a valid integer')
        process.exit(1)
      }
      const offsetSeconds = parseOffset(opts.offset)

      console.error('Fetching laptimes and probing video...')
      const [html, durationSeconds] = await Promise.all([
        fetchHtml(url),
        getVideoDuration(opts.video),
      ])
      const durationInFrames = Math.ceil(durationSeconds * fps)

      const drivers = parseDrivers(html)
      const driver = await selectDriver(drivers, driverQuery)
      const timestamps = calculateTimestamps(driver.laps, offsetSeconds)

      console.error(`Driver: [${driver.kart}] ${driver.name} — ${driver.laps.length} laps`)

      const session: SessionData = {
        driver: { kart: driver.kart, name: driver.name },
        laps: driver.laps,
        timestamps,
      }
      const overlayProps: OverlayProps = { session, fps, durationInFrames }

      // Resolves to apps/renderer/src/index.ts from apps/cli/dist/ at runtime.
      // This only works when run from within the monorepo working tree (dev use).
      const rendererEntry = path.resolve(
        __dirname,
        '../../../apps/renderer/src/index.ts',
      )
      const overlayPath = opts.output.replace(/\.[^.]+$/, '-overlay.mov')

      console.error('Rendering overlay (this may take a few minutes)...')
      try {
        await renderOverlay(rendererEntry, opts.style, overlayProps, overlayPath, makeProgressCallback('Rendering'))
      } finally {
        process.stderr.write('\n')
      }

      const overlayX = parseInt(opts.overlayX, 10)
      const overlayY = parseInt(opts.overlayY, 10)
      if (isNaN(overlayX) || isNaN(overlayY)) {
        console.error('Error: --overlay-x and --overlay-y must be valid integers')
        process.exit(1)
      }

      console.error('Compositing video...')
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

      console.log(`Done: ${opts.output}`)
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function makeProgressCallback(label: string): (progress: number) => void {
  const startTime = Date.now()
  return (progress: number) => {
    const elapsed = (Date.now() - startTime) / 1000
    const pct = Math.round(progress * 100)
    if (progress > 0) {
      const remaining = Math.max(0, elapsed / progress - elapsed)
      process.stderr.write(`\r  ${label}: ${pct}% — ETA ${formatSeconds(Math.round(remaining))}   `)
    } else {
      process.stderr.write(`\r  ${label}: ${pct}%`)
    }
  }
}

program.parseAsync(process.argv).catch((err: Error) => {
  console.error('Error:', err.message)
  process.exit(1)
})
