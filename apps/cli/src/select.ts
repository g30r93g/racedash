import { checkbox } from '@inquirer/prompts'
import { readdir, stat } from 'node:fs/promises'
import { join, win32 } from 'node:path'

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.MP4', '.MOV', '.m4v', '.M4V'])

export function getVideoChoiceLabel(filePath: string): string {
  return win32.basename(filePath)
}

/**
 * If `videoArg` is a directory, list video files and let the user pick via checkbox.
 * Returns the selected file paths in the order chosen.
 * If `videoArg` is already a file path, returns it as-is (single-element array).
 */
export async function resolveVideoFiles(videoArg: string): Promise<string[]> {
  let isDir = false
  try {
    isDir = (await stat(videoArg)).isDirectory()
  } catch {
    // not a directory — treat as file path
  }
  if (!isDir) return [videoArg]

  const entries = await readdir(videoArg)
  const videos = entries
    .filter(f => VIDEO_EXTS.has(f.slice(f.lastIndexOf('.'))))
    .sort()
    .map(f => join(videoArg, f))

  if (videos.length === 0) throw new Error(`No video files found in: ${videoArg}`)
  if (videos.length === 1) return videos

  const chosen = await checkbox({
    message: 'Select footage (space to toggle, enter to confirm):',
    choices: videos.map(f => ({ name: getVideoChoiceLabel(f), value: f })),
    validate: v => v.length > 0 || 'Select at least one file',
  })

  return chosen as string[]
}
