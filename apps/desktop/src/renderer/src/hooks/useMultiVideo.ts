import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { MultiVideoInfo } from '../../../types/ipc'

export interface FileEntry {
  path: string
  durationSeconds: number
  startSeconds: number
}

export interface ResolvedFile {
  fileIndex: number
  path: string
  localTime: number
}

/**
 * Given a list of sequential files and a global time, returns
 * which file is active and the local time within it.
 */
export function resolveFileAtTime(files: FileEntry[], globalTime: number): ResolvedFile {
  const clamped = Math.max(0, globalTime)

  for (let i = files.length - 1; i >= 0; i--) {
    if (clamped >= files[i].startSeconds) {
      const localTime = Math.min(clamped - files[i].startSeconds, files[i].durationSeconds)
      return { fileIndex: i, path: files[i].path, localTime }
    }
  }

  return { fileIndex: 0, path: files[0].path, localTime: 0 }
}

/**
 * Hook that loads multi-video info and exposes the virtual timeline.
 * Returns null while loading.
 */
export function useMultiVideo(videoPaths: string[]): MultiVideoInfo | null {
  const [info, setInfo] = useState<MultiVideoInfo | null>(null)

  useEffect(() => {
    if (videoPaths.length === 0) return
    let cancelled = false
    window.racedash
      .getMultiVideoInfo(videoPaths)
      .then((result) => {
        if (!cancelled) setInfo(result)
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error('Failed to load video info', {
            description: err instanceof Error ? err.message : String(err),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [JSON.stringify(videoPaths)])

  return info
}
