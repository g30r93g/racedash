import { checkbox, select } from '@inquirer/prompts'
import type { DriverRow } from '@racedash/scraper'
import { readdir, stat } from 'node:fs/promises'
import { join, win32 } from 'node:path'

export async function selectDriver(
  drivers: DriverRow[],
  query: string | undefined,
): Promise<DriverRow> {
  if (!drivers.length) throw new Error('No drivers found in session.')
  const candidates = filterDrivers(drivers, query)
  if (candidates.length === 1) return candidates[0]
  return promptDriver(candidates)
}

function filterDrivers(drivers: DriverRow[], query: string | undefined): DriverRow[] {
  if (!query) return drivers
  const q = query.toLowerCase()
  const matches = drivers.filter(d => d.name.toLowerCase().includes(q))
  if (!matches.length) {
    throw new Error(
      `No drivers matching '${query}'. Available: ${drivers.map(d => d.name).join(', ')}`,
    )
  }
  return matches
}

async function promptDriver(candidates: DriverRow[]): Promise<DriverRow> {
  return select({
    message: 'Select driver:',
    choices: candidates.map(d => ({
      name: `[${d.kart.padStart(3)}] ${d.name}`,
      value: d,
    })),
  })
}

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
