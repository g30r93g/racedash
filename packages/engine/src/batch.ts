import type { SessionSegment } from '@racedash/core'

const SUB_RENDER_PRE_ROLL_SECONDS = 5
const SUB_RENDER_POST_ROLL_SECONDS = 5

function snapToFrame(seconds: number, fps: number): number {
  return Math.round(seconds * fps) / fps
}

export function rebaseSegment(
  segment: SessionSegment,
  actualClipStartSeconds: number,
  fps: number,
): SessionSegment {
  const rebaseTime = (yt: number) => snapToFrame(yt - actualClipStartSeconds, fps)

  return {
    ...segment,
    session: {
      ...segment.session,
      laps: segment.session.laps,
      timestamps: segment.session.timestamps.map((t) => ({
        ...t,
        ytSeconds: rebaseTime(t.ytSeconds),
      })),
    },
    sessionAllLaps: segment.sessionAllLaps,
    leaderboardDrivers: segment.leaderboardDrivers?.map((d) => ({
      ...d,
      timestamps: d.timestamps.map((t) => ({ ...t, ytSeconds: rebaseTime(t.ytSeconds) })),
    })),
    raceLapSnapshots: segment.raceLapSnapshots?.map((s) => ({
      ...s,
      videoTimestamp: rebaseTime(s.videoTimestamp),
    })),
    positionOverrides: segment.positionOverrides?.map((o) => ({
      ...o,
      timestamp: snapToFrame(o.timestamp - actualClipStartSeconds, fps),
    })),
  }
}

export function computeClipRange(
  startSeconds: number,
  endSeconds: number,
  fps: number,
  totalDurationSeconds: number,
): { startFrame: number; endFrame: number } {
  const startSec = Math.max(0, startSeconds - SUB_RENDER_PRE_ROLL_SECONDS)
  const endSec = Math.min(totalDurationSeconds, endSeconds + SUB_RENDER_POST_ROLL_SECONDS)
  return {
    startFrame: Math.round(startSec * fps), // inclusive
    endFrame: Math.round(endSec * fps), // exclusive
  }
}

export interface FileFrameRange {
  path: string
  startFrame: number // inclusive
  endFrame: number // exclusive
}

export function resolveSourceFiles(
  files: FileFrameRange[],
  requiredStartFrame: number,
  requiredEndFrame: number,
): FileFrameRange[] {
  return files.filter(
    (f) => f.startFrame < requiredEndFrame && f.endFrame > requiredStartFrame,
  )
}
