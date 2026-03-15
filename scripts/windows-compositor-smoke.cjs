const { execFile } = require('node:child_process')
const { stat, mkdtemp } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

async function main() {
  const { compositeVideo, getOverlayRenderProfile } = require('../packages/compositor/dist/index.js')

  const profile = getOverlayRenderProfile('win32')
  if (profile.extension !== '.webm' || profile.codec !== 'vp9') {
    throw new Error(`Expected Windows overlay profile to use VP9 WebM, got ${JSON.stringify(profile)}`)
  }

  const workdir = await mkdtemp(join(tmpdir(), 'racedash-win-smoke-'))
  const sourcePath = join(workdir, 'source.mp4')
  const overlayPath = join(workdir, 'overlay.webm')
  const outputPath = join(workdir, 'output.mp4')
  const diagnostics = []

  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'testsrc2=size=320x180:rate=30',
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:duration=1',
    '-t', '1',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-shortest',
    '-y',
    sourcePath,
  ])

  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'color=c=black@0.0:s=320x180:r=30:d=1',
    '-vf', 'format=rgba,drawbox=x=20:y=20:w=120:h=40:color=red@0.8:t=fill',
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-auto-alt-ref', '0',
    '-y',
    overlayPath,
  ])

  await compositeVideo(sourcePath, overlayPath, outputPath, {
    durationSeconds: 1,
    runtimePlatform: 'win32',
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  })

  await stat(outputPath)

  const decodeDiagnostic = diagnostics.find((diagnostic) => diagnostic.label === 'Decode')
  if (!decodeDiagnostic) {
    throw new Error(`Expected decode diagnostics, got ${JSON.stringify(diagnostics)}`)
  }
  if (!['cuda', 'qsv', 'd3d11va', 'dxva2', 'software'].includes(decodeDiagnostic.value)) {
    throw new Error(`Unexpected decode path: ${JSON.stringify(diagnostics)}`)
  }

  console.log(`Windows smoke output created: ${outputPath}`)
  console.log(`Live diagnostics: ${JSON.stringify(diagnostics)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
