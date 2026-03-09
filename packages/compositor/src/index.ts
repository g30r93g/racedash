import type { OverlayProps } from '@racedash/core'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { cpus, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface CompositeOptions {
  fps?: number
  videoBitrate?: string
  overlayX?: number
  overlayY?: number
  durationSeconds?: number
}

/**
 * Bundle the Remotion renderer entry point, render the overlay as ProRes 4444 with alpha,
 * and write it to `outputPath`.
 */
export async function renderOverlay(
  rendererEntryPoint: string,
  compositionId: string,
  props: OverlayProps,
  outputPath: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const serveUrl = await bundle({ entryPoint: rendererEntryPoint })
  const inputProps = props as unknown as Record<string, unknown>
  const comp = await selectComposition({ serveUrl, id: compositionId, inputProps })
  await renderMedia({
    serveUrl,
    composition: comp,
    codec: 'prores',
    proResProfile: '4444',
    outputLocation: outputPath,
    inputProps,
    chromiumOptions: { gl: 'angle' },
    concurrency: Math.max(1, cpus().length - 1),
    onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
  })
}

/**
 * Composite overlay.mov onto source.mp4 using FFmpeg with hardware encoding.
 * Requires FFmpeg with h264_videotoolbox (macOS).
 */
export async function compositeVideo(
  sourcePath: string,
  overlayPath: string,
  outputPath: string,
  opts: CompositeOptions = {},
  onProgress?: (progress: number) => void,
): Promise<void> {
  const { fps = 60, videoBitrate = '50M', overlayX = 0, overlayY = 0, durationSeconds } = opts
  const totalSeconds = durationSeconds ?? await getVideoDuration(sourcePath)
  if (totalSeconds <= 0) throw new Error(`Video duration must be positive, got ${totalSeconds}`)
  await runFFmpegWithProgress(
    [
      '-hwaccel', 'videotoolbox',
      '-i', sourcePath,
      '-i', overlayPath,
      '-filter_complex', `[1:v]format=rgba[ov];[0:v][ov]overlay=x=${overlayX}:y=${overlayY}`,
      '-r', String(fps),
      '-pix_fmt', 'yuv420p',
      '-c:v', 'hevc_videotoolbox',
      '-tag:v', 'hvc1',
      '-b:v', videoBitrate,
      '-c:a', 'copy',
      '-y',
      outputPath,
    ],
    totalSeconds,
    onProgress,
  )
}

/**
 * Get video duration in seconds using ffprobe.
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
  const seconds = parseFloat(stdout.trim())
  if (isNaN(seconds)) throw new Error(`ffprobe returned no duration for: ${videoPath}`)
  return seconds
}

/**
 * Concatenate video files losslessly using FFmpeg's concat demuxer.
 * Writes a temporary file list to os.tmpdir(), runs ffmpeg -c copy, then cleans up.
 */
export async function joinVideos(inputs: string[], outputPath: string): Promise<void> {
  if (inputs.length < 2) throw new Error('joinVideos requires at least 2 input files')

  const durations = await Promise.all(inputs.map(getVideoDuration))
  const totalSeconds = durations.reduce((a, b) => a + b, 0)

  const tmpFile = resolve(tmpdir(), `racedash-concat-${randomUUID()}.txt`)
  const list = inputs.map(f => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join('\n')
  await writeFile(tmpFile, list, 'utf-8')
  try {
    await runFFmpegWithProgress(
      ['-f', 'concat', '-safe', '0', '-i', tmpFile, '-c', 'copy', '-y', outputPath],
      totalSeconds,
      (pct) => {
        const processed = pct * totalSeconds
        process.stderr.write(
          `\rProgress: ${Math.round(pct * 100)}% (${_formatSeconds(processed)} / ${_formatSeconds(totalSeconds)})`,
        )
      },
    )
    process.stderr.write('\n')
  } finally {
    await unlink(tmpFile).catch(() => {})
  }
}

function _formatSeconds(seconds: number): string {
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const processed =
          parseInt(match[1], 10) * 3600 +
          parseInt(match[2], 10) * 60 +
          parseFloat(match[3])
        const pct = Math.max(0, Math.min(1, processed / totalSeconds))
        onProgress?.(pct)
      }
    })
    proc.on('close', (code: number | null, signal: string | null) => {
      if (code === 0) resolve()
      else if (signal) reject(new Error(`ffmpeg killed by signal ${signal}\n${stderr}`))
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
    proc.on('error', reject)
  })
}
