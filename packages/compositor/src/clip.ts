import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function buildExtractClipArgs(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
): string[] {
  const startSec = startFrame / fps
  const duration = (endFrame - startFrame) / fps
  return [
    '-ss', String(startSec),
    '-i', sourcePath,
    '-t', String(duration),
    '-c', 'copy',
    '-y', outputPath,
  ]
}

export async function probeActualStartSeconds(filePath: string, requestedStartSeconds: number): Promise<number> {
  // Try format-level start_time first (most reliable with -copyts stream copy)
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=start_time',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    const pts = parseFloat(stdout.trim())
    if (!isNaN(pts) && pts >= 0) return pts
  } catch { /* fall through */ }

  // Try stream-level start_time
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=start_time',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ])
    const pts = parseFloat(stdout.trim())
    if (!isNaN(pts) && pts >= 0) return pts
  } catch { /* fall through */ }

  // Fall back to requested start — overlay will be aligned to requested position
  // (at most ~2s off due to I-frame rounding, within the 5s pre-roll buffer)
  console.warn(`[extractClip] Could not probe start PTS from ${filePath}, using requested start ${requestedStartSeconds}s`)
  return requestedStartSeconds
}

export async function extractClip(
  sourcePath: string,
  outputPath: string,
  startFrame: number,
  endFrame: number,
  fps: number,
  signal: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<{ actualStartSeconds: number }> {
  const args = buildExtractClipArgs(sourcePath, outputPath, startFrame, endFrame, fps)
  const totalSeconds = (endFrame - startFrame) / fps

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    let settled = false

    const onAbort = () => {
      proc.kill('SIGTERM')
      if (!settled) { settled = true; reject(new Error('Cancelled')) }
    }
    signal.addEventListener('abort', onAbort, { once: true })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const processed = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3])
        onProgress?.(Math.max(0, Math.min(1, processed / totalSeconds)))
      }
    })
    proc.on('close', (code, sig) => {
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else if (sig) reject(new Error(`ffmpeg killed by signal ${sig}\n${stderr}`))
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
    proc.on('error', (error: NodeJS.ErrnoException) => {
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      reject(error.code === 'ENOENT' ? new Error('ffmpeg not found on PATH') : error)
    })
  })

  // Without -copyts, the output PTS starts at ~0.
  // The actual start in source timeline is the requested start (I-frame rounding
  // adds at most ~2s extra pre-roll, absorbed by the 5s buffer).
  const actualStartSeconds = startFrame / fps
  return { actualStartSeconds }
}
