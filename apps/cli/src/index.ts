#!/usr/bin/env node
import { program } from 'commander'
import path from 'node:path'
import type { BoxPosition, CornerPosition } from '@racedash/core'
import {
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  type OverlayStyling,
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
        stat(`Segment ${index + 1}`, `[${segment.config.source}]  [${segment.config.mode}]`)
        if (segment.config.label) stat('  Label', segment.config.label)
        printCapabilities(segment.capabilities)
      })

      if (result.driverListsIdentical) {
        const drivers = result.segments[0]?.drivers ?? []
        printDriverList(drivers, opts.driver, 'Drivers')
      } else {
        result.segments.forEach((segment, index) => {
          if (index > 0) process.stdout.write('\n')
          process.stdout.write(`Segment ${index + 1}  [${segment.config.source}]  [${segment.config.mode}]\n`)
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
          `[${resolvedSegment.config.source}]  [${resolvedSegment.config.mode}]  ${formatDriverDisplay(selectedDriver)}  ·  ${selectedDriver.laps.length} laps`,
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

let lastPhase = ''

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
      stat('Alpha', getOverlayRenderProfile().label)
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
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
    if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) return [parseInt(rgb[1], 10), parseInt(rgb[2], 10), parseInt(rgb[3], 10)]
  const named: Record<string, [number, number, number]> = { white: [255, 255, 255], black: [0, 0, 0] }
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

  process.stderr.write('  Styling\n')
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
