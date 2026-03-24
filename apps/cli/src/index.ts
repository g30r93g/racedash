#!/usr/bin/env node
import { program } from 'commander'
import path from 'node:path'
import type { BoxPosition, CornerPosition } from '@racedash/core'
import {
  // DEFAULT_FADE_DURATION_SECONDS, // TODO: use in upcoming fade config scheme
  // DEFAULT_FADE_ENABLED, // TODO: use in upcoming fade config scheme
  // DEFAULT_FADE_PRE_ROLL_SECONDS, // TODO: use in upcoming fade config scheme
  DEFAULT_LABEL_WINDOW_SECONDS,
} from '@racedash/core'
import { resolveVideoFiles } from './select'
import {
  generateTimestamps,
  getRenderExperimentalWarning,
  getOverlayRenderProfile,
  joinVideos,
  listDrivers,
  renderSession,
  runDoctor,
  TIMING_FEATURES,
  formatDriverDisplay,
  filterDriverHighlights,
} from '@racedash/engine'
import type { DriversCommandSegment, RenderProgressEvent } from '@racedash/engine'

type OutputResolutionPreset = '1080p' | '1440p' | '2160p'

function displaySource(config: { source: string; originalSource?: string }): string {
  return config.source === 'cached' && config.originalSource
    ? config.originalSource
    : config.source
}

const OUTPUT_RESOLUTIONS: Record<OutputResolutionPreset, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
}

const VALID_BOX_POSITIONS: BoxPosition[] = ['bottom-left', 'bottom-center', 'bottom-right', 'top-left', 'top-center', 'top-right']
const VALID_TABLE_POSITIONS: CornerPosition[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right']

export function formatDoctorDiagnostics(
  diagnostics: Array<{ label: string; value: string }>,
): string {
  const width = Math.max(...diagnostics.map(diagnostic => diagnostic.label.length), 6)
  return [
    'racedash doctor',
    '',
    ...diagnostics.map(diagnostic => `  ${diagnostic.label.padEnd(width)}  ${diagnostic.value}`),
  ].join('\n')
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

program
  .name('racedash')
  .description('Config-driven timing → YouTube chapters + race overlays')
  .version('0.1.0')

program
  .command('drivers')
  .description('List drivers for the configured timing segments')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .option('--driver <name>', 'Driver name to highlight (partial, case-insensitive)')
  .action(async (opts: { config: string; driver?: string }) => {
    try {
      console.error('Fetching...')
      const result = await listDrivers({ configPath: opts.config, driverQuery: opts.driver })

      process.stderr.write('\n')
      result.segments.forEach((segment, index) => {
        stat(`Segment ${index + 1}`, `[${displaySource(segment.config)}]  [${segment.config.mode}]`)
        if (segment.config.label) stat('  Label', segment.config.label)
        printCapabilities(segment.capabilities)
      })

      if (result.driverListsIdentical) {
        const drivers = result.segments[0]?.drivers ?? []
        printDriverList(drivers, opts.driver, 'Drivers')
      } else {
        result.segments.forEach((segment, index) => {
          if (index > 0) process.stdout.write('\n')
          process.stdout.write(`Segment ${index + 1}  [${displaySource(segment.config)}]  [${segment.config.mode}]\n`)
          if (segment.config.label) process.stdout.write(`  Label: ${segment.config.label}\n`)
          printDriverList(segment.drivers, opts.driver)
        })
      }
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

program
  .command('timestamps')
  .description('Output YouTube chapter timestamps to stdout from a config file')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .option('--fps <n>', 'Video fps used when any segment offset is given as "<frames> F"')
  .action(async (opts: { config: string; fps?: string }) => {
    try {
      const fps = parseOptionalFps(opts.fps)
      console.error('Fetching...')
      const result = await generateTimestamps({ configPath: opts.config, fps })

      process.stderr.write('\n')
      result.segments.forEach((resolvedSegment, index) => {
        const selectedDriver = resolvedSegment.selectedDriver!
        stat(
          `Segment ${index + 1}`,
          `[${displaySource(resolvedSegment.config)}]  [${resolvedSegment.config.mode}]  ${formatDriverDisplay(selectedDriver)}  ·  ${selectedDriver.laps.length} laps`,
        )
        stat('  Offset', formatOffsetTime(result.offsets[index]))
        if (resolvedSegment.config.label) stat('  Label', resolvedSegment.config.label)
        printCapabilities(resolvedSegment.capabilities)
      })

      console.log(result.chapters)
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

program
  .command('doctor')
  .description('Inspect your machine and FFmpeg setup for rendering')
  .action(async () => {
    try {
      const diagnostics = await runDoctor()
      const warning = getRenderExperimentalWarning()
      const output = warning == null
        ? diagnostics
        : [{ label: 'Warning', value: warning }, ...diagnostics]
      console.log(formatDoctorDiagnostics(output))
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

interface RenderOpts {
  config: string
  video: string
  output: string
  style: string
  outputResolution?: string
  overlayX: string
  overlayY?: string
  boxPosition?: string
  qualifyingTablePosition?: string
  labelWindow?: string
  noCache: boolean
  onlyRenderOverlay: boolean
}

program
  .command('render')
  .description('Render overlay onto video')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .requiredOption('--video <path>', 'Source video file path or directory')
  .option('--output <path>', 'Output file path', './out.mp4')
  .option('--style <name>', 'Overlay style', 'banner')
  .option('--output-resolution <preset>', 'Output resolution: 1080p, 1440p, or 2160p')
  .option('--overlay-x <n>', 'Overlay X position in pixels', '0')
  .option('--overlay-y <n>', 'Overlay Y position in pixels (auto-computed for esports/minimal styles if omitted)')
  .option('--box-position <pos>', 'Position for esports/minimal/modern')
  .option('--qualifying-table-position <pos>', 'Corner for qualifying table')
  .option('--label-window <seconds>', 'Seconds to show segment label', DEFAULT_LABEL_WINDOW_SECONDS.toString())
  .option('--no-cache', 'Force re-render the overlay')
  .option('--only-render-overlay', 'Render overlay file only, skip compositing')
  .action(async (opts: RenderOpts) => {
    let lastPhase = ''
    try {
      const renderWarning = getRenderExperimentalWarning()
      if (renderWarning) process.stderr.write(`\n  Warning      ${renderWarning}\n`)

      if (opts.boxPosition != null && !VALID_BOX_POSITIONS.includes(opts.boxPosition as BoxPosition)) {
        console.error(`Error: --box-position must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
        process.exit(1)
      }
      if (opts.qualifyingTablePosition != null && !VALID_TABLE_POSITIONS.includes(opts.qualifyingTablePosition as CornerPosition)) {
        console.error(`Error: --qualifying-table-position must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
        process.exit(1)
      }

      const outputResolution = resolveOutputResolutionPreset(opts.outputResolution)
      const labelWindowSeconds = parseFloat(opts.labelWindow ?? DEFAULT_LABEL_WINDOW_SECONDS.toString())
      if (isNaN(labelWindowSeconds) || labelWindowSeconds < 0) {
        console.error('Error: --label-window must be a non-negative number')
        process.exit(1)
      }

      const overlayX = parseInt(opts.overlayX, 10)
      const overlayY = opts.overlayY != null ? parseInt(opts.overlayY, 10) : undefined
      if (isNaN(overlayX) || (overlayY != null && isNaN(overlayY))) {
        console.error('Error: --overlay-x and --overlay-y must be valid integers')
        process.exit(1)
      }

      const selectedFiles = await resolveVideoFiles(opts.video)
      const rendererEntry = path.resolve(__dirname, '../../../apps/renderer/src/index.ts')

      // Adapter: renderSession emits { phase, progress } but makeProgressCallback expects (progress: number)
      // and must be called fresh each time the phase label changes so it initialises a new progress bar.
      let phaseBarCallback: ((n: number) => void) | null = null
      lastPhase = ''
      const progressAdapter = ({ phase, progress }: RenderProgressEvent) => {
        if (phase !== lastPhase) {
          if (lastPhase) process.stderr.write('\n')
          lastPhase = phase
          phaseBarCallback = makeProgressCallback(phase)
        }
        phaseBarCallback!(progress)
      }

      stat('Alpha', getOverlayRenderProfile().label)
      const result = await renderSession(
        {
          configPath: opts.config,
          videoPaths: selectedFiles,
          outputPath: opts.output,
          rendererEntry,
          style: opts.style,
          outputResolution: outputResolution ? { width: outputResolution.width, height: outputResolution.height } : undefined,
          overlayX,
          overlayY,
          boxPosition: opts.boxPosition as BoxPosition | undefined,
          qualifyingTablePosition: opts.qualifyingTablePosition as CornerPosition | undefined,
          labelWindowSeconds,
          noCache: opts.noCache,
          onlyRenderOverlay: opts.onlyRenderOverlay,
        },
        progressAdapter,
        ({ label, value }) => stat(label, value),
      )

      process.stderr.write('\n')
      console.log(result.outputPath)
    } catch (err) {
      if (lastPhase) process.stderr.write('\n')
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

const BAR_WIDTH = 30

function parseOptionalFps(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const fps = parseFloat(raw)
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('--fps must be a positive number')
  }
  return fps
}

function printDriverList(drivers: DriversCommandSegment['drivers'], highlightQuery: string | undefined, heading?: string): void {
  if (heading) process.stdout.write(`${heading}\n`)

  if (drivers.length === 0) {
    process.stdout.write('  Driver discovery unavailable for this source.\n')
    return
  }

  const highlights = new Set(filterDriverHighlights(drivers, highlightQuery).map(driver => `${driver.kart}::${driver.name}`))
  drivers.forEach((driver, index) => {
    const marker = highlights.has(`${driver.kart}::${driver.name}`) ? '*' : ' '
    process.stdout.write(`${marker} ${String(index + 1).padStart(2)}. ${formatDriverDisplay(driver)}\n`)
  })

  if (highlightQuery && highlights.size === 0) {
    process.stdout.write(`  No matches for "${highlightQuery}".\n`)
  }
}

function printCapabilities(capabilities: DriversCommandSegment['capabilities']): void {
  process.stderr.write('  Features\n')
  for (const feature of TIMING_FEATURES) {
    process.stderr.write(`    [${capabilities[feature.key] ? 'x' : ' '}] ${feature.label}\n`)
  }
}

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
  const SAMPLE_MS = 1000
  const WINDOW = 10
  const samples: Array<[number, number]> = []
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

if (require.main === module) {
  program.parseAsync(process.argv).catch((err: Error) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
