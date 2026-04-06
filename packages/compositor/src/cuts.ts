interface CutRegion {
  id: string
  startFrame: number
  endFrame: number
}

interface Transition {
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
