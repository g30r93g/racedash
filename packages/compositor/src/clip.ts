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
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-af', 'afade=t=in:d=0.1',
    '-copyts',
    '-y', outputPath,
  ]
}

export async function probeActualStartSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'frame=pts_time',
    '-read_intervals', '%+#1',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  const pts = parseFloat(stdout.trim())
  if (isNaN(pts)) {
    throw new Error(`Failed to probe start PTS from ${filePath}: ffprobe returned "${stdout.trim()}"`)
  }
  return pts
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

  const actualStartSeconds = await probeActualStartSeconds(outputPath)
  return { actualStartSeconds }
}
