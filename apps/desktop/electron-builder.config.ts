import type { Configuration } from 'electron-builder'
import path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffprobeStatic = require('ffprobe-static') as { path: string | null }

function requireBinaryPath(tool: string, resolvedPath: string | null): string {
  if (!resolvedPath) {
    throw new Error(`${tool} binary was not resolved during packaging`)
  }
  return resolvedPath
}

const macArch: 'arm64' | 'x64' = process.arch === 'arm64' ? 'arm64' : 'x64'

// Metal compositor binary path (macOS only, may not exist on other platforms)
const metalCompositePath = path.resolve(__dirname, '../../native/metal-composite/.build/release/metal-composite')
const metalCompositeExists = process.platform === 'darwin' && require('fs').existsSync(metalCompositePath)

const config: Configuration = {
  appId: 'com.racedash.app',
  productName: 'RaceDash',
  directories: {
    buildResources: 'build',
    output: 'release',
  },
  files: ['out/**/*'],
  extraResources: [
    {
      from: requireBinaryPath('ffmpeg', ffmpegStatic),
      to: process.platform === 'win32' ? 'ffmpeg/ffmpeg.exe' : 'ffmpeg/ffmpeg',
    },
    {
      from: requireBinaryPath('ffprobe', ffprobeStatic.path),
      to: process.platform === 'win32' ? 'ffmpeg/ffprobe.exe' : 'ffmpeg/ffprobe',
    },
    // Metal GPU compositor (macOS only)
    ...(metalCompositeExists
      ? [{ from: metalCompositePath, to: 'metal-composite' }]
      : []),
  ],
  mac: {
    icon: 'build/icon.icns',
    target: [{ target: 'dmg', arch: [macArch] }],
    category: 'public.app-category.video',
  },
  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  publish: {
    provider: 'github',
    owner: 'g30r93g',
    repo: 'racedash',
  },
}

export default config
