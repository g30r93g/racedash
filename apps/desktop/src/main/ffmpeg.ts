import { existsSync } from 'node:fs'
import path from 'node:path'

type ToolName = 'ffmpeg' | 'ffprobe'

function getExecutableName(tool: ToolName): string {
  return process.platform === 'win32' ? `${tool}.exe` : tool
}

export function getBundledToolPath(tool: ToolName): string | null {
  if (typeof process.resourcesPath !== 'string' || process.resourcesPath.length === 0) {
    return null
  }

  const bundledPath = path.join(process.resourcesPath, 'ffmpeg', getExecutableName(tool))
  return existsSync(bundledPath) ? bundledPath : null
}

function getPathEnvKey(): string {
  return Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
}

export function configureBundledFfmpegPath(): void {
  const ffmpegPath = getBundledToolPath('ffmpeg')
  if (!ffmpegPath) return

  const binDir = path.dirname(ffmpegPath)
  const pathKey = getPathEnvKey()
  const currentPath = process.env[pathKey] ?? ''
  const entries = currentPath.split(path.delimiter).filter(Boolean)
  if (entries.includes(binDir)) return

  process.env[pathKey] = [binDir, ...entries].join(path.delimiter)
}

export function resolveFfprobeCommand(): string {
  return getBundledToolPath('ffprobe') ?? 'ffprobe'
}
