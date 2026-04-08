import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'

export interface MetalCompositeOptions {
  sourcePath: string
  overlayPath: string
  outputPath: string
  overlayX: number
  overlayY: number
  overlayScaleWidth?: number
  overlayScaleHeight?: number
  quality?: number
  fps: number
}

/**
 * Resolve the path to the metal-composite binary.
 * In dev: built binary in native/metal-composite/.build/release/
 * In prod: bundled in extraResources/
 */
function resolveBinaryPath(): string | null {
  // Production: packaged Electron app
  const resourcesPath = (process as unknown as Record<string, string>).resourcesPath
  if (resourcesPath) {
    const packaged = path.join(resourcesPath, 'metal-composite')
    if (existsSync(packaged)) return packaged
  }

  // Dev: built from source
  const devPath = path.resolve(__dirname, '../../../native/metal-composite/.build/release/metal-composite')
  if (existsSync(devPath)) return devPath

  // Dev: alt path (worktree)
  const altPath = path.resolve(__dirname, '../../../../native/metal-composite/.build/release/metal-composite')
  if (existsSync(altPath)) return altPath

  return null
}

/**
 * Check if the Metal compositor is available on this machine.
 */
export function isMetalCompositorAvailable(): boolean {
  return process.platform === 'darwin' && resolveBinaryPath() !== null
}

/**
 * Composite overlay onto source video using Metal GPU blending.
 * Falls back to null if the binary isn't available.
 */
export async function metalComposite(
  opts: MetalCompositeOptions,
  signal: AbortSignal,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const binaryPath = resolveBinaryPath()
  if (!binaryPath) {
    throw new Error('metal-composite binary not found. Run native/metal-composite/build.sh first.')
  }

  const args: string[] = [
    '--source', opts.sourcePath,
    '--overlay', opts.overlayPath,
    '--output', opts.outputPath,
    '--overlay-x', String(opts.overlayX),
    '--overlay-y', String(opts.overlayY),
    '--quality', String(opts.quality ?? 65),
    '--fps', String(opts.fps),
  ]

  if (opts.overlayScaleWidth != null && opts.overlayScaleHeight != null) {
    args.push('--overlay-scale-width', String(opts.overlayScaleWidth))
    args.push('--overlay-scale-height', String(opts.overlayScaleHeight))
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(binaryPath, args)
    let stderr = ''
    let settled = false

    const onAbort = () => {
      proc.kill('SIGTERM')
      if (!settled) { settled = true; reject(new Error('Cancelled')) }
    }
    signal.addEventListener('abort', onAbort, { once: true })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text

      // Parse progress: "frame=1500/2945"
      const match = text.match(/frame=(\d+)\/(\d+)/)
      if (match) {
        const current = parseInt(match[1], 10)
        const total = parseInt(match[2], 10)
        if (total > 0) onProgress?.(current / total)
      }
    })

    proc.on('close', (code, sig) => {
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      if (code === 0) resolve()
      else if (sig) reject(new Error(`metal-composite killed by signal ${sig}\n${stderr}`))
      else reject(new Error(`metal-composite exited with code ${code}\n${stderr}`))
    })

    proc.on('error', (error: NodeJS.ErrnoException) => {
      signal.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      reject(error.code === 'ENOENT'
        ? new Error('metal-composite binary not found at: ' + binaryPath)
        : error)
    })
  })
}
