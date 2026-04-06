import { spawn } from 'node:child_process'

export interface CutRegion {
  id: string
  startFrame: number
  endFrame: number
}

export interface Transition {
  id: string
  boundaryId: string
  type: string
  durationMs: number
}

interface CutConcatResult {
  args: string[]
  trimFilterUsed: boolean
}

export function computeKeptRanges(
  totalFrames: number,
  cuts: CutRegion[],
): Array<{ startFrame: number; endFrame: number }> {
  if (cuts.length === 0) return [{ startFrame: 0, endFrame: totalFrames }]

  const sorted = [...cuts].sort((a, b) => a.startFrame - b.startFrame)
  const merged = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    if (sorted[i].startFrame <= prev.endFrame) {
      prev.endFrame = Math.max(prev.endFrame, sorted[i].endFrame)
    } else {
      merged.push({ ...sorted[i] })
    }
  }

  const ranges: Array<{ startFrame: number; endFrame: number }> = []
  let cursor = 0
  for (const cut of merged) {
    if (cut.startFrame > cursor) ranges.push({ startFrame: cursor, endFrame: cut.startFrame })
    cursor = cut.endFrame
  }
  if (cursor < totalFrames) ranges.push({ startFrame: cursor, endFrame: totalFrames })
  return ranges
}

export function buildCutConcatArgs(
  sourcePath: string,
  outputPath: string,
  cuts: CutRegion[],
  _transitions: Transition[],
  fps: number,
  totalDurationSeconds: number,
): CutConcatResult {
  const totalFrames = Math.ceil(totalDurationSeconds * fps)
  const keptRanges = computeKeptRanges(totalFrames, cuts)

  if (keptRanges.length === 1 && keptRanges[0].startFrame === 0 && keptRanges[0].endFrame === totalFrames) {
    return { args: [], trimFilterUsed: false }
  }

  if (keptRanges.length === 0) {
    return { args: [], trimFilterUsed: false }
  }

  const filters: string[] = []
  const concatInputs: string[] = []

  keptRanges.forEach((range, i) => {
    const startSec = range.startFrame / fps
    const endSec = range.endFrame / fps
    filters.push(`[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS[v${i}]`)
    filters.push(`[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS[a${i}]`)
    concatInputs.push(`[v${i}][a${i}]`)
  })

  filters.push(`${concatInputs.join('')}concat=n=${keptRanges.length}:v=1:a=1[outv][outa]`)
  const filterComplex = filters.join(';')

  return {
    trimFilterUsed: true,
    args: [
      '-i', sourcePath,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '[outa]',
      '-y', outputPath,
    ],
  }
}

/**
 * Apply cut regions to a video file, producing a trimmed output.
 * Returns true if trimming was performed, false if no cuts needed.
 */
export async function trimVideo(
  sourcePath: string,
  outputPath: string,
  cuts: CutRegion[],
  transitions: Transition[],
  fps: number,
  totalDurationSeconds: number,
  onProgress?: (progress: number) => void,
): Promise<boolean> {
  const result = buildCutConcatArgs(sourcePath, outputPath, cuts, transitions, fps, totalDurationSeconds)
  if (!result.trimFilterUsed) return false

  await runFfmpegWithProgress(result.args, totalDurationSeconds, onProgress)
  return true
}

function runFfmpegWithProgress(
  args: string[],
  totalSeconds: number,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    let settled = false

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const match = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (match) {
        const processed = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3])
        onProgress?.(Math.max(0, Math.min(1, processed / totalSeconds)))
      }
    })
    proc.on('close', (code: number | null, signal: string | null) => {
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else if (signal) reject(new Error(`ffmpeg killed by signal ${signal}\n${stderr}`))
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`))
    })
    proc.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      if (error.code === 'ENOENT') reject(new Error('ffmpeg was not found on PATH.'))
      else reject(error)
    })
  })
}
