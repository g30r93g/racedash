#!/usr/bin/env node
import { program } from 'commander'
import path from 'node:path'
import { access, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { DriverRow } from '@racedash/scraper'
import { resolveVideoFiles } from './select'
import {
  collectDoctorDiagnostics,
  compositeVideo,
  getOverlayOutputPath,
  getOverlayRenderProfile,
  getVideoDuration,
  getVideoFps,
  getVideoResolution,
  joinVideos,
  renderOverlay,
} from '@racedash/compositor'
import {
  type BoxPosition,
  type CornerPosition,
  DEFAULT_FADE_DURATION_SECONDS,
  DEFAULT_FADE_ENABLED,
  DEFAULT_FADE_PRE_ROLL_SECONDS,
  DEFAULT_LABEL_WINDOW_SECONDS,
  type OverlayProps,
  type OverlayStyling,
  type SessionMode,
} from '@racedash/core'
import { formatChapters, parseOffset } from '@racedash/timestamps'
import {
  buildRaceLapSnapshots,
  buildSessionSegments,
  driverListsAreIdentical,
  filterDriverHighlights,
  flattenTimestamps,
  formatDriverDisplay,
  loadTimingConfig,
  resolveDriversCommandSegments,
  resolvePositionOverrides,
  resolveTimingSegments,
  TIMING_FEATURES,
  validatePositionOverrideConfig,
  type TimingCapabilities,
} from './timingSources'

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

export function getRenderExperimentalWarning(
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (platform !== 'win32') return undefined
  return 'Windows render support is experimental and may require fallback paths depending on your FFmpeg and GPU setup.'
}

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

interface DriversOpts {
  config: string
  driver?: string
}

program
  .command('drivers')
  .description('List drivers for the configured timing segments')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .option('--driver <name>', 'Driver name to highlight (partial, case-insensitive)')
  .action(async (opts: DriversOpts) => {
    try {
      const { segments: segmentConfigs, driverQuery } = await loadTimingConfig(opts.config, false)
      const highlightQuery = opts.driver ?? driverQuery

      console.error('Fetching...')
      const resolvedSegments = await resolveDriversCommandSegments(segmentConfigs, highlightQuery)

      process.stderr.write('\n')
      resolvedSegments.forEach((segment, index) => {
        stat(`Segment ${index + 1}`, `[${segment.config.source}]  [${segment.config.mode}]`)
        if (segment.config.label) stat('  Label', segment.config.label)
        printCapabilities(segment.capabilities)
      })

      if (driverListsAreIdentical(resolvedSegments)) {
        const drivers = resolvedSegments[0]?.drivers ?? []
        printDriverList(drivers, highlightQuery, 'Drivers')
      } else {
        resolvedSegments.forEach((segment, index) => {
          if (index > 0) process.stdout.write('\n')
          process.stdout.write(`Segment ${index + 1}  [${segment.config.source}]  [${segment.config.mode}]\n`)
          if (segment.config.label) process.stdout.write(`  Label: ${segment.config.label}\n`)
          printDriverList(segment.drivers, highlightQuery)
        })
      }
    } catch (err) {
      console.error('Error:', (err as Error).message)
      process.exit(1)
    }
  })

interface TimestampsOpts {
  config: string
  fps?: string
}

program
  .command('timestamps')
  .description('Output YouTube chapter timestamps to stdout from a config file')
  .requiredOption('--config <path>', 'Path to JSON session config file')
  .option('--fps <n>', 'Video fps used when any segment offset is given as "<frames> F"')
  .action(async (opts: TimestampsOpts) => {
    try {
      const fps = parseOptionalFps(opts.fps)
      const { segments: segmentConfigs, driverQuery } = await loadTimingConfig(opts.config, true)

      console.error('Fetching...')
      const resolvedSegments = await resolveTimingSegments(segmentConfigs, driverQuery)
      const offsets = segmentConfigs.map(segment => parseOffset(segment.offset, fps))
      const { segments } = buildSessionSegments(resolvedSegments, offsets)

      process.stderr.write('\n')
      resolvedSegments.forEach((resolvedSegment, index) => {
        const selectedDriver = resolvedSegment.selectedDriver!
        stat(
          `Segment ${index + 1}`,
          `[${resolvedSegment.config.source}]  [${resolvedSegment.config.mode}]  ${formatDriverDisplay(selectedDriver)}  ·  ${selectedDriver.laps.length} laps`,
        )
        stat('  Offset', formatOffsetTime(offsets[index]))
        if (resolvedSegment.config.label) stat('  Label', resolvedSegment.config.label)
        printCapabilities(resolvedSegment.capabilities)
      })

      console.log(formatChapters(flattenTimestamps(segments)))
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
      const diagnostics = await collectDoctorDiagnostics()
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
  .requiredOption('--config <path>', 'Path to JSON session config file')
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
      const renderWarning = getRenderExperimentalWarning()
      if (renderWarning) {
        process.stderr.write(`\n  Warning      ${renderWarning}\n`)
      }

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

      const {
        segments: segmentConfigs,
        driverQuery,
        configBoxPosition,
        configTablePosition,
        styling,
      } = await loadTimingConfig(opts.config, true)

      if (configBoxPosition != null && !VALID_BOX_POSITIONS.includes(configBoxPosition as BoxPosition)) {
        throw new Error(`config.boxPosition must be one of: ${VALID_BOX_POSITIONS.join(', ')}`)
      }
      if (configTablePosition != null && !VALID_TABLE_POSITIONS.includes(configTablePosition as CornerPosition)) {
        throw new Error(`config.qualifyingTablePosition must be one of: ${VALID_TABLE_POSITIONS.join(', ')}`)
      }

      const boxPosition = (opts.boxPosition ?? configBoxPosition ?? defaultBoxPositionForStyle(opts.style)) as BoxPosition
      const resolvedTablePosition = (qualifyingTablePosition ?? configTablePosition) as CornerPosition | undefined

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

      const rawOffsets = segmentConfigs.map(segment => parseOffset(segment.offset, fps))
      const resolvedPositionOverrides = segmentConfigs.map((segment, index) =>
        resolvePositionOverrides(segment.positionOverrides, rawOffsets[index], index, fps),
      )
      const snappedOffsets = rawOffsets.map(raw => roundMillis(Math.round(raw / frameDuration) * frameDuration))

      const resolvedSegments = await resolveTimingSegments(segmentConfigs, driverQuery)
      const { segments, startingGridPosition } = buildSessionSegments(resolvedSegments, snappedOffsets)
      segments.forEach((segment, index) => {
        segment.positionOverrides = resolvedPositionOverrides[index]
      })

      const durationInFrames = Math.ceil(durationSeconds * fps)

      process.stderr.write('\n')
      resolvedSegments.forEach((resolvedSegment, index) => {
        const rawOffset = rawOffsets[index]
        const snappedOffset = snappedOffsets[index]
        const offsetSnapped = Math.abs(snappedOffset - rawOffset) >= 0.0001
        const selectedDriver = resolvedSegment.selectedDriver!
        stat(
          `Segment ${index + 1}`,
          `[${resolvedSegment.config.source}]  [${resolvedSegment.config.mode}]  ${formatDriverDisplay(selectedDriver)}  ·  ${selectedDriver.laps.length} laps`,
        )
        if (offsetSnapped) {
          stat('  Offset', `${formatOffsetTime(rawOffset)} → ${formatOffsetTime(snappedOffset)}  (snapped)`)
        } else {
          stat('  Offset', formatOffsetTime(snappedOffset))
        }
        if (resolvedSegment.config.label) stat('  Label', resolvedSegment.config.label)
        printCapabilities(resolvedSegment.capabilities)
      })

      stat('Video', `${videoResolution.width}×${videoResolution.height}  ·  ${formatFps(fps)} fps`)
      if (requestedOutputResolution != null) {
        stat('Output', `${outputResolution.width}×${outputResolution.height}  ·  ${requestedOutputResolution.preset}`)
      }
      if (startingGridPosition != null) stat('Grid', `P${startingGridPosition}`)
      stat('Style', opts.style)
      stat('Alpha', getOverlayRenderProfile().label)
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
      const overlayPath = getOverlayOutputPath(opts.output)
      const workStart = Date.now()

      let overlayReused = false
      if (!opts.noCache) {
        try {
          await access(overlayPath)
          const overlayDuration = await getVideoDuration(overlayPath)
          overlayReused = overlayDuration > 0
        } catch {
          overlayReused = false
        }
      }

      if (overlayReused) {
        process.stderr.write(`  Reusing overlay        ${overlayPath}\n`)
      } else {
        try {
          await renderOverlay(
            rendererEntry,
            opts.style,
            overlayProps,
            overlayPath,
            makeProgressCallback('Rendering overlay'),
          )
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
            onDiagnostic: ({ label, value }) => stat(label, value),
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

function parseOptionalFps(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const fps = parseFloat(raw)
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('--fps must be a positive number')
  }
  return fps
}

function printDriverList(drivers: DriverRow[], highlightQuery: string | undefined, heading?: string): void {
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

function printCapabilities(capabilities: TimingCapabilities): void {
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

function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000
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

export { buildRaceLapSnapshots, resolvePositionOverrides, validatePositionOverrideConfig }

if (require.main === module) {
  program.parseAsync(process.argv).catch((err: Error) => {
    console.error('Error:', err.message)
    process.exit(1)
  })
}
