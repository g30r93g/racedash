import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import type { OverlayProps } from '@racedash/core'

const execFileAsync = promisify(execFile)

export interface CompositeOptions {
  fps?: number
  videoBitrate?: string
  overlayX?: number
  overlayY?: number
}

/**
 * Bundle the Remotion renderer entry point, render the overlay as ProRes 4444 with alpha,
 * and write it to `outputPath`.
 */
export async function renderOverlay(
  rendererEntryPoint: string,
  props: OverlayProps,
  outputPath: string,
): Promise<void> {
  const serveUrl = await bundle({ entryPoint: rendererEntryPoint })
  const inputProps = props as unknown as Record<string, unknown>
  const comp = await selectComposition({ serveUrl, id: 'gt7', inputProps })
  await renderMedia({
    serveUrl,
    composition: comp,
    codec: 'prores',
    outputLocation: outputPath,
    inputProps,
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
): Promise<void> {
  const { fps = 60, videoBitrate = '50M', overlayX = 0, overlayY = 0 } = opts
  await execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-i', overlayPath,
    '-filter_complex', `[0:v][1:v]overlay=x=${overlayX}:y=${overlayY}`,
    '-r', String(fps),
    '-c:v', 'h264_videotoolbox',
    '-b:v', videoBitrate,
    '-c:a', 'copy',
    '-y',
    outputPath,
  ])
}

/**
 * Get video duration in frames using ffprobe.
 */
export async function getVideoDurationFrames(
  videoPath: string,
  fps: number,
): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ])
  const seconds = parseFloat(stdout.trim())
  return Math.ceil(seconds * fps)
}
