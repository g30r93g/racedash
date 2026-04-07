import { spawn } from 'node:child_process'

export interface CutRegion {
  id: string
  startFrame: number
  endFrame: number
}

export type TransitionType = 'fadeFromBlack' | 'fadeToBlack' | 'fadeThroughBlack' | 'crossfade'

export interface ResolvedTransition {
  /** 'start' = project start, 'end' = project end, number = seam index between kept ranges */
  seam: 'start' | 'end' | number
  type: TransitionType
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
  resolvedTransitions: ResolvedTransition[],
  fps: number,
  totalDurationSeconds: number,
): CutConcatResult {
  const totalFrames = Math.ceil(totalDurationSeconds * fps)
  const keptRanges = computeKeptRanges(totalFrames, cuts)

  if (keptRanges.length === 0) {
    return { args: [], trimFilterUsed: false }
  }

  if (keptRanges.length === 1 && keptRanges[0].startFrame === 0 && keptRanges[0].endFrame === totalFrames && resolvedTransitions.length === 0) {
    return { args: [], trimFilterUsed: false }
  }

  const startTransition = resolvedTransitions.find((t) => t.seam === 'start')
  const endTransition = resolvedTransitions.find((t) => t.seam === 'end')

  const filters: string[] = []

  // Step 1: Trim each kept range
  keptRanges.forEach((range, i) => {
    const startSec = range.startFrame / fps
    const endSec = range.endFrame / fps
    filters.push(`[0:v]trim=start=${startSec}:end=${endSec},setpts=PTS-STARTPTS[v${i}]`)
    filters.push(`[0:a]atrim=start=${startSec}:end=${endSec},asetpts=PTS-STARTPTS[a${i}]`)
  })

  // Step 2: Apply fade-in at project start (to first segment)
  if (startTransition && keptRanges.length > 0) {
    const durSec = startTransition.durationMs / 1000
    filters.push(`[v0]fade=t=in:st=0:d=${durSec}[v0f]`)
    filters.push(`[a0]afade=t=in:st=0:d=${durSec}[a0f]`)
  }

  // Step 3: Apply fade-out at project end (to last segment)
  if (endTransition && keptRanges.length > 0) {
    const lastIdx = keptRanges.length - 1
    const lastRange = keptRanges[lastIdx]
    const segDuration = (lastRange.endFrame - lastRange.startFrame) / fps
    const durSec = endTransition.durationMs / 1000
    const fadeStart = Math.max(0, segDuration - durSec)
    const srcLabel = lastIdx === 0 && startTransition ? `v${lastIdx}f` : `v${lastIdx}`
    const srcALabel = lastIdx === 0 && startTransition ? `a${lastIdx}f` : `a${lastIdx}`
    filters.push(`[${srcLabel}]fade=t=out:st=${fadeStart}:d=${durSec}[v${lastIdx}e]`)
    filters.push(`[${srcALabel}]afade=t=out:st=${fadeStart}:d=${durSec}[a${lastIdx}e]`)
  }

  // Step 4: Build seam transitions between kept ranges and concat
  if (keptRanges.length === 1) {
    // Single range — just apply start/end fades
    let vLabel = 'v0'
    let aLabel = 'a0'
    if (startTransition) { vLabel = 'v0f'; aLabel = 'a0f' }
    if (endTransition) { vLabel = 'v0e'; aLabel = 'a0e' }
    filters.push(`[${vLabel}]copy[outv]`)
    filters.push(`[${aLabel}]acopy[outa]`)
  } else {
    // Multiple ranges — handle seam transitions
    // Determine label for each segment after start/end fades
    const vLabels: string[] = keptRanges.map((_, i) => {
      if (i === 0 && startTransition) return `v${i}f`
      if (i === keptRanges.length - 1 && endTransition) return `v${i}e`
      return `v${i}`
    })
    const aLabels: string[] = keptRanges.map((_, i) => {
      if (i === 0 && startTransition) return `a${i}f`
      if (i === keptRanges.length - 1 && endTransition) return `a${i}e`
      return `a${i}`
    })

    // Check for seam transitions (crossfade, fade-through-black, etc.)
    const seamTransitions = resolvedTransitions.filter((t) => typeof t.seam === 'number')

    if (seamTransitions.length === 0) {
      // No seam transitions — simple concat
      const concatInputs = keptRanges.map((_, i) => `[${vLabels[i]}][${aLabels[i]}]`).join('')
      filters.push(`${concatInputs}concat=n=${keptRanges.length}:v=1:a=1[outv][outa]`)
    } else {
      // Process seam transitions using xfade for crossfade, or fade+concat for others
      // Chain xfade filters: each xfade takes the previous output and the next segment
      let currentV = vLabels[0]
      let currentA = aLabels[0]
      let currentDuration = (keptRanges[0].endFrame - keptRanges[0].startFrame) / fps

      for (let i = 0; i < keptRanges.length - 1; i++) {
        const seamT = seamTransitions.find((t) => t.seam === i)
        const nextV = vLabels[i + 1]
        const nextA = aLabels[i + 1]
        const outV = i < keptRanges.length - 2 ? `xv${i}` : 'outv'
        const outA = i < keptRanges.length - 2 ? `xa${i}` : 'outa'

        if (seamT && seamT.type === 'crossfade') {
          const durSec = seamT.durationMs / 1000
          const offset = Math.max(0, currentDuration - durSec)
          filters.push(`[${currentV}][${nextV}]xfade=transition=fade:duration=${durSec}:offset=${offset}[${outV}]`)
          filters.push(`[${currentA}][${nextA}]acrossfade=d=${durSec}[${outA}]`)
          currentDuration = currentDuration + (keptRanges[i + 1].endFrame - keptRanges[i + 1].startFrame) / fps - durSec
        } else if (seamT && seamT.type === 'fadeThroughBlack') {
          const halfDur = seamT.durationMs / 2000
          // Fade out current, fade in next, then concat
          const fadeOutStart = Math.max(0, currentDuration - halfDur)
          filters.push(`[${currentV}]fade=t=out:st=${fadeOutStart}:d=${halfDur}[fo${i}v]`)
          filters.push(`[${currentA}]afade=t=out:st=${fadeOutStart}:d=${halfDur}[fo${i}a]`)
          filters.push(`[${nextV}]fade=t=in:st=0:d=${halfDur}[fi${i}v]`)
          filters.push(`[${nextA}]afade=t=in:st=0:d=${halfDur}[fi${i}a]`)
          filters.push(`[fo${i}v][fo${i}a][fi${i}v][fi${i}a]concat=n=2:v=1:a=1[${outV}][${outA}]`)
          currentDuration = currentDuration + (keptRanges[i + 1].endFrame - keptRanges[i + 1].startFrame) / fps
        } else if (seamT && seamT.type === 'fadeToBlack') {
          const durSec = seamT.durationMs / 1000
          const fadeOutStart = Math.max(0, currentDuration - durSec)
          filters.push(`[${currentV}]fade=t=out:st=${fadeOutStart}:d=${durSec}[fo${i}v]`)
          filters.push(`[${currentA}]afade=t=out:st=${fadeOutStart}:d=${durSec}[fo${i}a]`)
          filters.push(`[fo${i}v][fo${i}a][${nextV}][${nextA}]concat=n=2:v=1:a=1[${outV}][${outA}]`)
          currentDuration = currentDuration + (keptRanges[i + 1].endFrame - keptRanges[i + 1].startFrame) / fps
        } else if (seamT && seamT.type === 'fadeFromBlack') {
          const durSec = seamT.durationMs / 1000
          filters.push(`[${nextV}]fade=t=in:st=0:d=${durSec}[fi${i}v]`)
          filters.push(`[${nextA}]afade=t=in:st=0:d=${durSec}[fi${i}a]`)
          filters.push(`[${currentV}][${currentA}][fi${i}v][fi${i}a]concat=n=2:v=1:a=1[${outV}][${outA}]`)
          currentDuration = currentDuration + (keptRanges[i + 1].endFrame - keptRanges[i + 1].startFrame) / fps
        } else {
          // No transition at this seam — simple concat
          filters.push(`[${currentV}][${currentA}][${nextV}][${nextA}]concat=n=2:v=1:a=1[${outV}][${outA}]`)
          currentDuration = currentDuration + (keptRanges[i + 1].endFrame - keptRanges[i + 1].startFrame) / fps
        }

        currentV = outV
        currentA = outA
      }
    }
  }

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
 * Apply cut regions and transitions to a video file.
 * Returns true if processing was performed, false if no changes needed.
 */
export async function trimVideo(
  sourcePath: string,
  outputPath: string,
  cuts: CutRegion[],
  resolvedTransitions: ResolvedTransition[],
  fps: number,
  totalDurationSeconds: number,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = buildCutConcatArgs(sourcePath, outputPath, cuts, resolvedTransitions, fps, totalDurationSeconds)
  if (!result.trimFilterUsed) return false

  await runFfmpegWithProgress(result.args, totalDurationSeconds, onProgress, signal)
  return true
}

function runFfmpegWithProgress(
  args: string[],
  totalSeconds: number,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    let settled = false

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
        onProgress?.(Math.max(0, Math.min(1, processed / totalSeconds)))
      }
    })
    proc.on('close', (code: number | null, sig: string | null) => {
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else if (sig) reject(new Error(`ffmpeg killed by signal ${sig}\n${stderr}`))
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
