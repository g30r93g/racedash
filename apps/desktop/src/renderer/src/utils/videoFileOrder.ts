/**
 * GoPro naming convention:
 * - Hero8+: GX{chapter:2}{session:4}.MP4 (e.g. GX010042.MP4)
 * - Hero5-7: GP{chapter:2}{session:4}.MP4 (e.g. GP010015.MP4)
 *
 * Chapter = 2-digit sequence number within a session.
 * Session = 4-digit recording session ID.
 */

interface GoProFile {
  path: string
  chapter: number
  sessionId: string
}

const GOPRO_PATTERN = /^G[PX](\d{2})(\d{4})\.\w+$/i

function parseGoProFilename(filePath: string): GoProFile | null {
  const filename = filePath.split(/[\\/]/).pop() ?? ''
  const match = GOPRO_PATTERN.exec(filename)
  if (!match) return null
  return {
    path: filePath,
    chapter: parseInt(match[1], 10),
    sessionId: match[2],
  }
}

/**
 * Sort video file paths using camera-specific naming conventions.
 *
 * When ALL files match a known camera pattern (e.g. GoPro), sort by
 * session ID then chapter number. When files are mixed or unrecognised,
 * preserve the original order.
 *
 * Does not mutate the input array.
 */
export function smartSortVideoPaths(paths: string[]): string[] {
  if (paths.length <= 1) return [...paths]

  const parsed = paths.map(parseGoProFilename)

  // Only sort if ALL files match GoPro pattern
  if (parsed.every((p): p is GoProFile => p !== null)) {
    return [...parsed]
      .sort((a, b) => {
        if (a.sessionId !== b.sessionId) return a.sessionId.localeCompare(b.sessionId)
        return a.chapter - b.chapter
      })
      .map((p) => p.path)
  }

  // Unknown or mixed — preserve original order
  return [...paths]
}
