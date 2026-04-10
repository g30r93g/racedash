import path from 'node:path'

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function buildOutputPath(
  dir: string,
  type: 'entireProject' | 'segment' | 'linkedSegment' | 'lap',
  options: {
    labels?: string[]
    lapNumber?: number
    timestamp?: string
    overlayOnly?: boolean
  } = {},
): string {
  const ts = options.timestamp ?? new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  const ext = options.overlayOnly ? '.mov' : '.mp4'
  const overlaySuffix = options.overlayOnly ? '-overlay' : ''

  if (type === 'entireProject') {
    return path.join(dir, `output${overlaySuffix}-${ts}${ext}`)
  }

  const slug = (options.labels ?? []).map(slugify).join('-') || 'unknown'

  if (type === 'lap') {
    return path.join(dir, `output-${slug}-lap${options.lapNumber}${overlaySuffix}-${ts}${ext}`)
  }

  return path.join(dir, `output-${slug}${overlaySuffix}-${ts}${ext}`)
}
