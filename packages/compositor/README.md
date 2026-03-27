# @racedash/compositor

Remotion bundler/renderer wrapper, FFmpeg video compositing, GPU detection, and FFmpeg codec validation.

## Overview

Handles two concerns: (1) rendering a Remotion composition to an alpha-channel video file (ProRes 4444 on macOS, VP9 WebM on Windows), and (2) compositing that overlay onto a source video using FFmpeg with hardware-accelerated decoding where available.

## Local Development

```bash
pnpm --filter @racedash/compositor build
pnpm --filter @racedash/compositor test          # runs with --pool forks (subprocess isolation for FFmpeg)
pnpm --filter @racedash/compositor test:coverage
```

Requires FFmpeg and ffprobe on `PATH`. See the root README for install instructions.

## Architecture

Single source file: `src/index.ts`. Key exports:

| Export | Purpose |
|---|---|
| `renderOverlay(entry, compositionId, props, outputPath)` | Bundle + render a Remotion composition to an alpha video |
| `compositeVideo(source, overlay, output, opts)` | FFmpeg composite: overlay onto source |
| `getOverlayRenderProfile(platform)` | Returns codec/format for the current platform |
| `probeFfmpegCapabilities()` | Queries available encoders and hwaccels |
| `getWindowsHardwareInfo()` | PowerShell query for CPU/GPU on Windows |
| `collectDoctorDiagnostics(opts)` | Gather all diagnostics for `racedash doctor` |
| `getVideoFps / getVideoDuration / getVideoResolution` | ffprobe wrappers |
| `joinVideos(inputs, output)` | Lossless concat via FFmpeg concat demuxer |

**Platform behaviour:**
- **macOS** — ProRes 4444 alpha overlay, `hevc_videotoolbox` output, `videotoolbox` decode
- **Windows** — VP9 WebM overlay, `libx264` output, GPU decode probed from `cuda`/`d3d11va`/`dxva2`/`qsv` candidates
- **Linux** — VP9 WebM overlay, `libx264` output, software decode

## Testing

```bash
pnpm --filter @racedash/compositor test
```

Tests run with `--pool forks` to isolate child-process spawning. Unit tests mock FFmpeg calls; no actual video files required.
