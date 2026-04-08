import type { OverlayProps } from '@racedash/core'
export { trimVideo, computeKeptRanges, type ResolvedTransition } from './cuts'
export { extractClip, probeActualStartSeconds, buildExtractClipArgs } from './clip'
// bundleRenderer is exported via the renderOverlay block above
import { bundle } from '@remotion/bundler'
import { renderMedia, renderFrames, selectComposition, makeCancelSignal } from '@remotion/renderer'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { cpus, tmpdir } from 'node:os'
import path, { resolve, win32 } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface CompositeDiagnostic {
  label: string
  value: string
}

export interface OverlayRenderProfile {
  extension: '.mov' | '.webm'
  codec: 'prores' | 'vp9'
  pixelFormat: 'yuva444p10le' | 'yuva420p'
  proResProfile?: '4444'
  label: string
}

export type GpuVendor = 'nvidia' | 'intel' | 'amd' | 'unknown'

export interface WindowsHardwareInfo {
  cpu: string | null
  cpuManufacturer: string | null
  gpuNames: string[]
  gpuVendors: GpuVendor[]
}

export interface FfmpegCapabilities {
  encoders: Set<string>
  hwaccels: Set<string>
  ffprobeVersion: string
}

export interface DoctorOptions {
  runtimePlatform?: NodeJS.Platform
  ffmpegCapabilities?: FfmpegCapabilities
  windowsHardwareInfo?: WindowsHardwareInfo
}

export interface CompositeOptions {
  fps?: number
  videoBitrate?: string
  overlayX?: number
  overlayY?: number
  durationSeconds?: number
  outputWidth?: number
  outputHeight?: number
  /** Scale the overlay to these dimensions during composite (for lower-res overlay on higher-res video). */
  overlayScaleWidth?: number
  overlayScaleHeight?: number
  onDiagnostic?: (diagnostic: CompositeDiagnostic) => void
  runtimePlatform?: NodeJS.Platform
  ffmpegCapabilities?: FfmpegCapabilities
  windowsHardwareInfo?: WindowsHardwareInfo
  skipDecodePreflight?: boolean
}

interface CompositePlan {
  args: string[]
  decodePath: string
  softwareFallback: boolean
}

interface WindowsVideoController {
  Name?: string
  AdapterCompatibility?: string
  PNPDeviceID?: string
}

interface WindowsProcessor {
  Name?: string
  Manufacturer?: string
}

const WINDOWS_WARNING = 'Install FFmpeg and make sure both ffmpeg and ffprobe are available on your PATH.'

function emitDiagnostic(
  onDiagnostic: CompositeOptions['onDiagnostic'],
  label: string,
  value: string | null | undefined,
): void {
  if (!onDiagnostic || value == null || value === '') return
  onDiagnostic({ label, value })
}

function buildFriendlyToolError(command: string): Error {
  return new Error(`${command} was not found on PATH. ${WINDOWS_WARNING}`)
}

async function execTool(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(command, args)
    return {
      stdout: String((result as { stdout?: string | Buffer }).stdout ?? ''),
      stderr: String((result as { stderr?: string | Buffer }).stderr ?? ''),
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
    if (err.code === 'ENOENT') throw buildFriendlyToolError(command)
    throw err
  }
}

function toLowerSet(values: Iterable<string>): Set<string> {
  return new Set(Array.from(values, (value) => value.trim().toLowerCase()).filter(Boolean))
}

export function getOverlayRenderProfile(platform: NodeJS.Platform = process.platform): OverlayRenderProfile {
  if (platform === 'win32') {
    return {
      extension: '.webm',
      codec: 'vp9',
      pixelFormat: 'yuva420p',
      label: 'VP9 alpha (WebM)',
    }
  }
  return {
    extension: '.mov',
    codec: 'prores',
    proResProfile: '4444',
    pixelFormat: 'yuva444p10le',
    label: 'ProRes 4444 alpha (MOV)',
  }
}

export function getOverlayOutputPath(outputPath: string, platform: NodeJS.Platform = process.platform): string {
  return outputPath.replace(/\.[^.]+$/, `-overlay${getOverlayRenderProfile(platform).extension}`)
}

/**
 * Bundle the Remotion renderer entry point, render the overlay with alpha,
 * and write it to `outputPath`.
 */
/**
 * Bundle the Remotion renderer entry point. Call once and reuse the serveUrl
 * across multiple renderOverlay calls (e.g., in a batch).
 */
export async function bundleRenderer(rendererEntryPoint: string): Promise<string> {
  return bundle({ entryPoint: rendererEntryPoint })
}

export async function renderOverlay(
  serveUrlOrEntryPoint: string,
  compositionId: string,
  props: OverlayProps,
  outputPath: string,
  onProgress?: (event: { progress: number; renderedFrames: number; totalFrames: number }) => void,
  runtimePlatform: NodeJS.Platform = process.platform,
  signal?: AbortSignal,
): Promise<void> {
  // Accept either a pre-bundled serveUrl (starts with /) or an entry point (bundle on the fly)
  const serveUrl = serveUrlOrEntryPoint.startsWith('/')
    ? serveUrlOrEntryPoint
    : await bundle({ entryPoint: serveUrlOrEntryPoint })
  const inputProps = props as unknown as Record<string, unknown>
  const comp = await selectComposition({ serveUrl, id: compositionId, inputProps })
  const profile = getOverlayRenderProfile(runtimePlatform)
  const totalFrames = comp.durationInFrames

  // Bridge native AbortSignal to Remotion's CancelSignal
  let remotionCancelSignal: ReturnType<typeof makeCancelSignal> | undefined
  if (signal) {
    remotionCancelSignal = makeCancelSignal()
    signal.addEventListener('abort', () => remotionCancelSignal!.cancel(), { once: true })
  }

  if (profile.codec === 'prores') {
    await renderMedia({
      serveUrl,
      composition: comp,
      codec: 'prores',
      proResProfile: '4444',
      pixelFormat: profile.pixelFormat,
      imageFormat: 'png',
      outputLocation: outputPath,
      inputProps,
      chromiumOptions: {},
      hardwareAcceleration: 'required',
      concurrency: cpus().length,
      cancelSignal: remotionCancelSignal?.cancelSignal,
      onProgress: onProgress
        ? ({ progress, renderedFrames }) => onProgress({ progress, renderedFrames, totalFrames })
        : undefined,
    })
    return
  }

  await renderMedia({
    serveUrl,
    composition: comp,
    codec: 'vp9',
    pixelFormat: profile.pixelFormat,
    imageFormat: 'png',
    outputLocation: outputPath,
    inputProps,
    chromiumOptions: {},
    hardwareAcceleration: 'required',
    concurrency: cpus().length,
    cancelSignal: remotionCancelSignal?.cancelSignal,
    onProgress: onProgress
      ? ({ progress, renderedFrames }) => onProgress({ progress, renderedFrames, totalFrames })
      : undefined,
  })
}

/**
 * Combined overlay render + composite in a single pipeline.
 * Skips the ProRes intermediate — renders overlay frames as PNGs to a temp dir,
 * then FFmpeg reads them as an image sequence for compositing.
 *
 * Saves ~15-20s by eliminating ProRes encode (Remotion stitcher) + decode (FFmpeg).
 */
export async function renderOverlayAndComposite(
  serveUrl: string,
  compositionId: string,
  props: OverlayProps,
  sourcePath: string,
  outputPath: string,
  opts: {
    fps: number
    overlayX: number
    overlayY: number
    durationSeconds: number
    outputWidth?: number
    outputHeight?: number
    overlayScaleWidth?: number
    overlayScaleHeight?: number
    onDiagnostic?: (diagnostic: CompositeDiagnostic) => void
    runtimePlatform?: NodeJS.Platform
    ffmpegCapabilities?: FfmpegCapabilities
    windowsHardwareInfo?: WindowsHardwareInfo
  },
  onProgress?: (event: { phase: 'overlay' | 'composite'; progress: number; renderedFrames?: number; totalFrames?: number }) => void,
  signal?: AbortSignal,
): Promise<void> {
  const inputProps = props as unknown as Record<string, unknown>
  const comp = await selectComposition({ serveUrl, id: compositionId, inputProps })
  const totalFrames = comp.durationInFrames

  // Bridge AbortSignal to Remotion CancelSignal
  let remotionCancelSignal: ReturnType<typeof makeCancelSignal> | undefined
  if (signal) {
    remotionCancelSignal = makeCancelSignal()
    signal.addEventListener('abort', () => remotionCancelSignal!.cancel(), { once: true })
  }

  // Render overlay frames as PNG sequence to temp dir
  const framesDir = path.join(tmpdir(), `racedash-frames-${randomUUID()}`)
  mkdirSync(framesDir, { recursive: true })

  try {
    await renderFrames({
      serveUrl,
      composition: comp,
      imageFormat: 'png',
      outputDir: framesDir,
      inputProps,
      chromiumOptions: {},
      concurrency: cpus().length,
      cancelSignal: remotionCancelSignal?.cancelSignal,
      onStart: () => {},
      onFrameUpdate: (renderedFrames, _frameIndex) => {
        onProgress?.({
          phase: 'overlay',
          progress: renderedFrames / totalFrames,
          renderedFrames,
          totalFrames,
        })
      },
    })

    if (signal?.aborted) return

    // Build FFmpeg composite command with PNG sequence as overlay input
    const runtimePlatform = opts.runtimePlatform ?? process.platform
    // Remotion default pattern: element-NNNN.png (zero-padded)
    // FFmpeg image2 demuxer needs %0Nd format
    const files = readdirSync(framesDir).filter(f => f.endsWith('.png')).sort()
    if (files.length === 0) throw new Error('No overlay frames rendered')
    // Detect padding length from first file (e.g., element-0000.png → 4 digits)
    const padMatch = files[0].match(/element-(\d+)\.png/)
    const padLength = padMatch ? padMatch[1].length : 4
    const framePattern = path.join(framesDir, `element-%0${padLength}d.png`)

    // Build filter complex for overlay positioning + scaling
    const filterComplex = buildFilterComplex(
      opts.overlayX, opts.overlayY,
      opts.outputWidth, opts.outputHeight,
      opts.overlayScaleWidth, opts.overlayScaleHeight,
    )

    // Determine encoder based on platform
    const capabilities = opts.ffmpegCapabilities ?? (await probeFfmpegCapabilities())
    let encoderArgs: string[]
    let hwaccelArgs: string[] = []

    if (runtimePlatform === 'darwin') {
      hwaccelArgs = ['-hwaccel', 'videotoolbox']
      encoderArgs = ['-c:v', 'hevc_videotoolbox', '-tag:v', 'hvc1', '-q:v', '65']
    } else if (capabilities.encoders.has('hevc_nvenc')) {
      hwaccelArgs = ['-hwaccel', 'cuda']
      encoderArgs = ['-c:v', 'hevc_nvenc', '-preset', 'p4', '-cq', '28', '-tag:v', 'hvc1']
    } else if (capabilities.encoders.has('h264_nvenc')) {
      hwaccelArgs = ['-hwaccel', 'cuda']
      encoderArgs = ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23']
    } else {
      encoderArgs = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18']
    }

    const args = [
      ...hwaccelArgs,
      '-i', sourcePath,
      '-framerate', String(opts.fps),
      '-i', framePattern,
      '-filter_complex', filterComplex,
      '-r', String(opts.fps),
      '-pix_fmt', 'yuv420p',
      ...encoderArgs,
      '-c:a', 'copy',
      '-y', outputPath,
    ]

    await runFFmpegWithProgress(args, opts.durationSeconds, (p) => {
      onProgress?.({ phase: 'composite', progress: p })
    }, signal)

  } finally {
    // Clean up frame directory
    if (existsSync(framesDir)) {
      rmSync(framesDir, { recursive: true, force: true })
    }
  }
}

export function parseFpsValue(raw: string, videoPath: string): number {
  const value = raw.trim()
  const fractionMatch = value.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1])
    const denominator = parseFloat(fractionMatch[2])
    const fps = numerator / denominator
    if (Number.isFinite(fps) && fps > 0) return fps
  }

  const fps = parseFloat(value)
  if (Number.isFinite(fps) && fps > 0) return fps

  throw new Error(`ffprobe returned no fps for: ${videoPath}`)
}

function parseFfmpegEncoders(stdout: string): Set<string> {
  const encoders = new Set<string>()
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*[A-Z\.]{6}\s+([a-z0-9_]+)/i)
    if (match) encoders.add(match[1].toLowerCase())
  }
  return encoders
}

function parseFfmpegHwaccels(stdout: string): Set<string> {
  const hwaccels = new Set<string>()
  for (const line of stdout.split('\n')) {
    const value = line.trim().toLowerCase()
    if (!value || value.endsWith(':') || value.startsWith('hardware acceleration')) continue
    hwaccels.add(value)
  }
  return hwaccels
}

export async function probeFfmpegCapabilities(): Promise<FfmpegCapabilities> {
  const [encodersResult, hwaccelsResult, ffprobeResult] = await Promise.all([
    execTool('ffmpeg', ['-hide_banner', '-encoders']),
    execTool('ffmpeg', ['-hide_banner', '-hwaccels']),
    execTool('ffprobe', ['-version']),
  ])
  return {
    encoders: parseFfmpegEncoders(encodersResult.stdout),
    hwaccels: parseFfmpegHwaccels(hwaccelsResult.stdout),
    ffprobeVersion: ffprobeResult.stdout.split('\n')[0]?.trim() ?? '',
  }
}

function isWindowsAbsolutePath(filePath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')
}

export function normalizeConcatPath(filePath: string): string {
  const absolute = isWindowsAbsolutePath(filePath) ? win32.resolve(filePath) : resolve(filePath)
  return absolute.replace(/\\/g, '/').replace(/'/g, "'\\''")
}

function parsePowerShellJson<T>(raw: string | null | undefined): T[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as T | T[] | null
    if (parsed == null) return []
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

function inferGpuVendor(value: string): GpuVendor {
  const normalized = value.toLowerCase()
  if (normalized.includes('nvidia')) return 'nvidia'
  if (normalized.includes('intel')) return 'intel'
  if (normalized.includes('advanced micro devices') || normalized.includes('amd') || normalized.includes('ati')) {
    return 'amd'
  }
  return 'unknown'
}

export function parseWindowsHardwareInfo(
  gpuJson: string | null | undefined,
  cpuJson: string | null | undefined,
): WindowsHardwareInfo {
  const gpuRecords = parsePowerShellJson<WindowsVideoController>(gpuJson)
  const cpuRecords = parsePowerShellJson<WindowsProcessor>(cpuJson)

  const gpuNames = gpuRecords.map((record) => record.Name?.trim()).filter((value): value is string => Boolean(value))
  const gpuVendors = gpuRecords
    .map((record) =>
      inferGpuVendor([record.AdapterCompatibility, record.Name, record.PNPDeviceID].filter(Boolean).join(' ')),
    )
    .filter((value, index, values) => values.indexOf(value) === index)

  return {
    cpu: cpuRecords[0]?.Name?.trim() ?? null,
    cpuManufacturer: cpuRecords[0]?.Manufacturer?.trim() ?? null,
    gpuNames,
    gpuVendors: gpuVendors.length > 0 ? gpuVendors : ['unknown'],
  }
}

export async function getWindowsHardwareInfo(): Promise<WindowsHardwareInfo> {
  const runPowerShell = async (command: string): Promise<string | null> => {
    try {
      const result = await execTool('powershell', ['-NoProfile', '-Command', command])
      return result.stdout
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') return null
      return null
    }
  }

  const [gpuJson, cpuJson] = await Promise.all([
    runPowerShell(
      'Get-CimInstance Win32_VideoController | ' +
        'Select-Object Name,AdapterCompatibility,PNPDeviceID | ConvertTo-Json -Compress',
    ),
    runPowerShell('Get-CimInstance Win32_Processor | Select-Object Name,Manufacturer | ConvertTo-Json -Compress'),
  ])
  return parseWindowsHardwareInfo(gpuJson, cpuJson)
}

export function getWindowsDecodeCandidateOrder(gpuVendors: readonly GpuVendor[], hwaccels: Iterable<string>): string[] {
  const supported = toLowerSet(hwaccels)
  const primaryVendor = gpuVendors.includes('nvidia')
    ? 'nvidia'
    : gpuVendors.includes('intel')
      ? 'intel'
      : gpuVendors.includes('amd')
        ? 'amd'
        : 'unknown'

  const preferred =
    primaryVendor === 'nvidia'
      ? ['cuda', 'd3d11va', 'dxva2']
      : primaryVendor === 'intel'
        ? ['qsv', 'd3d11va', 'dxva2']
        : ['d3d11va', 'dxva2']

  const filtered = preferred.filter((candidate) => supported.has(candidate))
  return [...filtered, 'software']
}

function getRelevantEncoders(encoders: Iterable<string>): string[] {
  const relevant = [
    'hevc_videotoolbox',
    'h264_videotoolbox',
    'libx264',
    'h264_nvenc',
    'hevc_nvenc',
    'h264_qsv',
    'hevc_qsv',
    'h264_amf',
    'hevc_amf',
  ]
  const available = toLowerSet(encoders)
  return relevant.filter((encoder) => available.has(encoder))
}

export async function collectDoctorDiagnostics(opts: DoctorOptions = {}): Promise<CompositeDiagnostic[]> {
  const runtimePlatform = opts.runtimePlatform ?? process.platform
  const overlayProfile = getOverlayRenderProfile(runtimePlatform)
  const capabilities = opts.ffmpegCapabilities ?? (await probeFfmpegCapabilities())
  const diagnostics: CompositeDiagnostic[] = [
    { label: 'Platform', value: runtimePlatform },
    { label: 'Overlay', value: overlayProfile.label },
    { label: 'ffprobe', value: capabilities.ffprobeVersion || 'unknown' },
    {
      label: 'HWAccel',
      value: [...capabilities.hwaccels].sort().join(', ') || 'none',
    },
    {
      label: 'Encoders',
      value: getRelevantEncoders(capabilities.encoders).join(', ') || 'none',
    },
  ]

  if (runtimePlatform === 'win32') {
    const hardwareInfo = opts.windowsHardwareInfo ?? (await getWindowsHardwareInfo())
    diagnostics.push({
      label: 'CPU',
      value: hardwareInfo.cpu ?? 'Unknown',
    })
    diagnostics.push({
      label: 'GPU',
      value: hardwareInfo.gpuNames.join(', ') || 'Unknown',
    })
    diagnostics.push({
      label: 'Decode pref',
      value: getWindowsDecodeCandidateOrder(hardwareInfo.gpuVendors, capabilities.hwaccels).join(' -> '),
    })
    diagnostics.push({
      label: 'Output',
      value: 'libx264 (preset medium, crf 18)',
    })
    return diagnostics
  }

  if (runtimePlatform === 'darwin') {
    diagnostics.push({
      label: 'Decode pref',
      value: 'videotoolbox',
    })
    diagnostics.push({
      label: 'Output',
      value: 'hevc_videotoolbox',
    })
    return diagnostics
  }

  diagnostics.push({
    label: 'Decode pref',
    value: 'software',
  })
  diagnostics.push({
    label: 'Output',
    value: 'libx264 (preset medium, crf 18)',
  })
  return diagnostics
}

async function runFfmpegCapture(
  args: string[],
): Promise<{ code: number | null; signal: string | null; stderr: string }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    let settled = false

    const resolveOnce = (value: { code: number | null; signal: string | null; stderr: string }) => {
      if (settled) return
      settled = true
      resolvePromise(value)
    }

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    proc.on('close', (code: number | null, signal: string | null) => {
      resolveOnce({ code, signal, stderr })
    })
    proc.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        rejectPromise(buildFriendlyToolError('ffmpeg'))
        return
      }
      rejectPromise(error)
    })
  })
}

function buildFilterComplex(
  overlayX: number,
  overlayY: number,
  outputWidth?: number,
  outputHeight?: number,
  overlayScaleWidth?: number,
  overlayScaleHeight?: number,
): string {
  const filterParts: string[] = []
  let sourceLabel = '0:v'
  if (outputWidth != null && outputHeight != null) {
    filterParts.push(`[0:v]scale=${outputWidth}:${outputHeight}[src]`)
    sourceLabel = 'src'
  }
  // Scale overlay to match video if rendered at lower resolution
  if (overlayScaleWidth != null && overlayScaleHeight != null) {
    filterParts.push(`[1:v]format=rgba,scale=${overlayScaleWidth}:${overlayScaleHeight}:flags=lanczos[ov]`)
  } else {
    filterParts.push('[1:v]format=rgba[ov]')
  }
  filterParts.push(`[${sourceLabel}][ov]overlay=x=${overlayX}:y=${overlayY}`)
  return filterParts.join(';')
}

async function validateWindowsDecodeCandidate(
  candidate: string,
  sourcePath: string,
  overlayPath: string,
  filterComplex: string,
  durationSeconds: number,
): Promise<{ ok: boolean; error?: string }> {
  const args = [
    ...(candidate === 'software' ? [] : ['-hwaccel', candidate]),
    '-i',
    sourcePath,
    '-i',
    overlayPath,
    '-filter_complex',
    filterComplex,
    '-t',
    String(Math.min(2, Math.max(0.5, durationSeconds))),
    '-an',
    '-f',
    'null',
    '-',
  ]
  const result = await runFfmpegCapture(args)
  if (result.code === 0) return { ok: true }
  if (result.signal) return { ok: false, error: `signal ${result.signal}` }
  return { ok: false, error: result.stderr.trim() || `exit code ${result.code}` }
}

async function resolveWindowsCompositePlan(
  sourcePath: string,
  overlayPath: string,
  outputPath: string,
  opts: Required<Pick<CompositeOptions, 'fps' | 'overlayX' | 'overlayY'>> & CompositeOptions,
): Promise<CompositePlan> {
  const capabilities = opts.ffmpegCapabilities ?? (await probeFfmpegCapabilities())
  const hardwareInfo = opts.windowsHardwareInfo ?? (await getWindowsHardwareInfo())

  emitDiagnostic(opts.onDiagnostic, 'CPU', hardwareInfo.cpu ?? 'Unknown')
  emitDiagnostic(opts.onDiagnostic, 'GPU', hardwareInfo.gpuNames.join(', ') || 'Unknown')

  const filterComplex = buildFilterComplex(opts.overlayX, opts.overlayY, opts.outputWidth, opts.outputHeight, opts.overlayScaleWidth, opts.overlayScaleHeight)
  const candidates = getWindowsDecodeCandidateOrder(hardwareInfo.gpuVendors, capabilities.hwaccels)

  let selected = 'software'
  let softwareFallback = false
  for (const candidate of candidates) {
    if (opts.skipDecodePreflight) {
      selected = candidate
      softwareFallback = candidate === 'software' && candidates.length > 1
      break
    }

    if (candidate === 'software') {
      selected = 'software'
      softwareFallback = candidates.length > 1
      break
    }

    const result = await validateWindowsDecodeCandidate(
      candidate,
      sourcePath,
      overlayPath,
      filterComplex,
      opts.durationSeconds ?? 2,
    )
    if (result.ok) {
      selected = candidate
      break
    }
    emitDiagnostic(opts.onDiagnostic, 'Decode probe', `${candidate} failed; falling back`)
  }

  emitDiagnostic(opts.onDiagnostic, 'Decode', selected)
  emitDiagnostic(opts.onDiagnostic, 'Software fallback', softwareFallback ? 'yes' : 'no')

  // Select encoder: prefer NVENC hardware encode, fall back to libx264
  const useNvenc = capabilities.encoders.has('hevc_nvenc')
  const useNvencH264 = !useNvenc && capabilities.encoders.has('h264_nvenc')

  if (!useNvenc && !useNvencH264 && !capabilities.encoders.has('libx264')) {
    throw new Error('ffmpeg does not provide libx264, h264_nvenc, or hevc_nvenc. Install a build with encoder support.')
  }

  const encoderArgs: string[] = useNvenc
    ? ['-c:v', 'hevc_nvenc', '-preset', 'p4', '-cq', '28', '-tag:v', 'hvc1']
    : useNvencH264
      ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23']
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18']

  emitDiagnostic(opts.onDiagnostic, 'Encode', useNvenc ? 'hevc_nvenc' : useNvencH264 ? 'h264_nvenc' : 'libx264')

  return {
    decodePath: selected,
    softwareFallback,
    args: [
      ...(selected === 'software' ? [] : ['-hwaccel', selected]),
      '-i',
      sourcePath,
      '-i',
      overlayPath,
      '-filter_complex',
      filterComplex,
      '-r',
      String(opts.fps),
      '-pix_fmt',
      'yuv420p',
      ...encoderArgs,
      '-c:a',
      'copy',
      '-y',
      outputPath,
    ],
  }
}

function buildMacCompositePlan(
  sourcePath: string,
  overlayPath: string,
  outputPath: string,
  opts: Required<Pick<CompositeOptions, 'fps' | 'videoBitrate' | 'overlayX' | 'overlayY'>> & CompositeOptions,
): CompositePlan {
  return {
    decodePath: 'videotoolbox',
    softwareFallback: false,
    args: [
      '-hwaccel',
      'videotoolbox',
      '-i',
      sourcePath,
      '-i',
      overlayPath,
      '-filter_complex',
      buildFilterComplex(opts.overlayX, opts.overlayY, opts.outputWidth, opts.outputHeight, opts.overlayScaleWidth, opts.overlayScaleHeight),
      '-r',
      String(opts.fps),
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'hevc_videotoolbox',
      '-tag:v',
      'hvc1',
      '-q:v',
      '65',
      '-c:a',
      'copy',
      '-y',
      outputPath,
    ],
  }
}

async function buildGenericCompositePlan(
  sourcePath: string,
  overlayPath: string,
  outputPath: string,
  opts: Required<Pick<CompositeOptions, 'fps' | 'overlayX' | 'overlayY'>> & CompositeOptions,
): Promise<CompositePlan> {
  const capabilities = opts.ffmpegCapabilities ?? (await probeFfmpegCapabilities())

  // Prefer NVENC on Linux/cloud GPU instances
  const useNvenc = capabilities.encoders.has('hevc_nvenc')
  const useNvencH264 = !useNvenc && capabilities.encoders.has('h264_nvenc')
  const hwaccelArgs: string[] = useNvenc || useNvencH264
    ? ['-hwaccel', 'cuda']
    : []

  const encoderArgs: string[] = useNvenc
    ? ['-c:v', 'hevc_nvenc', '-preset', 'p4', '-cq', '28', '-tag:v', 'hvc1']
    : useNvencH264
      ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '23']
      : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18']

  emitDiagnostic(opts.onDiagnostic, 'Encode', useNvenc ? 'hevc_nvenc' : useNvencH264 ? 'h264_nvenc' : 'libx264')

  return {
    decodePath: useNvenc || useNvencH264 ? 'cuda' : 'software',
    softwareFallback: !useNvenc && !useNvencH264,
    args: [
      ...hwaccelArgs,
      '-i',
      sourcePath,
      '-i',
      overlayPath,
      '-filter_complex',
      buildFilterComplex(opts.overlayX, opts.overlayY, opts.outputWidth, opts.outputHeight, opts.overlayScaleWidth, opts.overlayScaleHeight),
      '-r',
      String(opts.fps),
      '-pix_fmt',
      'yuv420p',
      ...encoderArgs,
      '-c:a',
      'copy',
      '-y',
      outputPath,
    ],
  }
}

/**
 * Composite the overlay onto the source video using FFmpeg.
 */
export async function compositeVideo(
  sourcePath: string,
  overlayPath: string,
  outputPath: string,
  opts: CompositeOptions = {},
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const {
    fps = 60,
    videoBitrate = '50M',
    overlayX = 0,
    overlayY = 0,
    durationSeconds,
    outputWidth,
    outputHeight,
    runtimePlatform = process.platform,
  } = opts
  const totalSeconds = durationSeconds ?? (await getVideoDuration(sourcePath))
  if (totalSeconds <= 0) throw new Error(`Video duration must be positive, got ${totalSeconds}`)
  if ((outputWidth == null) !== (outputHeight == null)) {
    throw new Error('outputWidth and outputHeight must be provided together')
  }

  const resolvedOptions = {
    ...opts,
    fps,
    videoBitrate,
    overlayX,
    overlayY,
    durationSeconds: totalSeconds,
    outputWidth,
    outputHeight,
  }

  const plan =
    runtimePlatform === 'win32'
      ? await resolveWindowsCompositePlan(sourcePath, overlayPath, outputPath, resolvedOptions)
      : runtimePlatform === 'darwin'
        ? buildMacCompositePlan(sourcePath, overlayPath, outputPath, resolvedOptions)
        : await buildGenericCompositePlan(sourcePath, overlayPath, outputPath, resolvedOptions)

  await runFFmpegWithProgress(plan.args, totalSeconds, onProgress, signal)
}

/**
 * Get video fps using ffprobe. Prefers avg_frame_rate and falls back to r_frame_rate.
 */
export async function getVideoFps(videoPath: string): Promise<number> {
  const { stdout } = await execTool('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=avg_frame_rate,r_frame_rate',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    try {
      return parseFpsValue(line, videoPath)
    } catch {
      continue
    }
  }

  throw new Error(`ffprobe returned no fps for: ${videoPath}`)
}

/**
 * Get video duration in seconds using ffprobe.
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execTool('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
  const seconds = parseFloat(stdout.trim())
  if (isNaN(seconds)) throw new Error(`ffprobe returned no duration for: ${videoPath}`)
  return seconds
}

/**
 * Get video width and height in pixels using ffprobe.
 */
export async function getVideoResolution(videoPath: string): Promise<{ width: number; height: number }> {
  const { stdout } = await execTool('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=s=x:p=0',
    videoPath,
  ])
  const [w, h] = stdout.trim().split('x').map(Number)
  if (isNaN(w) || isNaN(h)) throw new Error(`ffprobe returned no resolution for: ${videoPath}`)
  return { width: w, height: h }
}

/**
 * Concatenate video files losslessly using FFmpeg's concat demuxer.
 * Writes a temporary file list to os.tmpdir(), runs ffmpeg -c copy, then cleans up.
 */
export async function joinVideos(inputs: string[], outputPath: string, signal?: AbortSignal): Promise<void> {
  if (inputs.length < 2) throw new Error('joinVideos requires at least 2 input files')

  const durations = await Promise.all(inputs.map(getVideoDuration))
  const totalSeconds = durations.reduce((a, b) => a + b, 0)

  const tmpFile = resolve(tmpdir(), `racedash-concat-${randomUUID()}.txt`)
  const list = inputs.map((filePath) => `file '${normalizeConcatPath(filePath)}'`).join('\n')
  await writeFile(tmpFile, list, 'utf-8')
  try {
    await runFFmpegWithProgress(
      ['-f', 'concat', '-safe', '0', '-i', tmpFile, '-c', 'copy', '-y', outputPath],
      totalSeconds,
      (pct) => {
        const processed = pct * totalSeconds
        process.stderr.write(
          `\rProgress: ${Math.round(pct * 100)}% (${formatSeconds(processed)} / ${formatSeconds(totalSeconds)})`,
        )
      },
      signal,
    )
    process.stderr.write('\n')
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function runFFmpegWithProgress(
  args: string[],
  totalSeconds: number,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    let settled = false

    const rejectOnce = (error: Error) => {
      if (settled) return
      settled = true
      rejectPromise(error)
    }

    const resolveOnce = () => {
      if (settled) return
      settled = true
      resolvePromise()
    }

    if (signal) {
      const onAbort = () => proc.kill('SIGTERM')
      signal.addEventListener('abort', onAbort, { once: true })
      proc.on('close', () => signal.removeEventListener('abort', onAbort))
    }

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const processed = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3])
        const pct = Math.max(0, Math.min(1, processed / totalSeconds))
        onProgress?.(pct)
      }
    })
    proc.on('close', (code: number | null, signal: string | null) => {
      if (code === 0) resolveOnce()
      else if (signal) rejectOnce(new Error(`ffmpeg killed by signal ${signal}\n${stderr}`))
      else rejectOnce(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
    proc.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        rejectOnce(buildFriendlyToolError('ffmpeg'))
        return
      }
      rejectOnce(error)
    })
  })
}
