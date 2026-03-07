# racedash — Overlay Pipeline Design

## Goal

Greenfield TypeScript monorepo replacing the Python CLI. Scrapes Alpha Timing lap data, outputs YouTube chapter timestamps, and renders a GT7-style overlay onto GoPro footage — fully automated, 4K 60fps, YouTube-ready.

## Product name

`racedash` — binary name exposed via `apps/cli`.

## Stack

- **Runtime:** Node.js
- **Language:** TypeScript (strict)
- **Monorepo:** Turborepo + pnpm workspaces
- **CLI:** Commander.js + `@inquirer/prompts` (interactive driver selection)
- **Scraping:** Cheerio + native `fetch`
- **Overlay rendering:** Remotion (React components, headless Chrome)
- **Video compositing:** FFmpeg via `packages/compositor` (macOS: `h264_videotoolbox`)

---

## Monorepo structure

```
apps/
  cli/              # Commander.js entry point, orchestrates the full pipeline
  renderer/         # Remotion project — overlay compositions and shared components
packages/
  core/             # shared TypeScript types: Lap, LapTimestamp, SessionData, OverlayProps
  scraper/          # Alpha Timing HTML scraper
  timestamps/       # pure functions: offset parsing, lap timestamp calculation, formatters
  compositor/       # FFmpeg wrapper (overlay render via @remotion/renderer + composite)
```

---

## Data flow

```
racedash timestamps / render
        │
        ▼
packages/scraper          fetch Alpha Timing HTML → DriverRow[]
        │
        ▼
packages/timestamps       calculate LapTimestamp[] + format YT chapters
        │
        ├──▶  stdout      YT chapter timestamps (timestamps subcommand)
        │
        ▼  (render subcommand only)
packages/compositor
  ├── @remotion/renderer  bundle() + renderMedia() → overlay.mov (ProRes 4444, alpha)
  └── FFmpeg              overlay.mov + source.mp4 → output.mp4
```

---

## CLI interface

```
racedash drivers <url>
  # Lists all drivers for a session

racedash timestamps <url> [driver] --offset <M:SS>
  # Outputs YouTube chapter timestamps to stdout

racedash render <url> [driver] --offset <M:SS> --video <path> [options]
  --style <name>      overlay style (default: gt7)
  --output <path>     output file (default: ./out.mp4)
  --fps <n>           output framerate (default: 60)
```

Driver argument is optional in all subcommands — omitting it or providing an ambiguous match triggers an interactive numbered list via `@inquirer/prompts`.

---

## Shared types (`packages/core`)

```ts
interface Lap {
  number: number
  lapTime: number       // seconds
  cumulative: number    // seconds
}

interface LapTimestamp {
  lap: Lap
  ytSeconds: number     // seconds from video start
}

interface SessionData {
  driver: { kart: string; name: string }
  laps: Lap[]
  timestamps: LapTimestamp[]
}

interface OverlayProps {
  session: SessionData
  fps: number
}
```

---

## Overlay architecture (`apps/renderer`)

```
src/
  styles/
    gt7/index.tsx         # GT7-style composition
    <future>/index.tsx    # new styles added here
  components/shared/
    LapTimer.tsx          # live timer, counts up from 0 each lap
    LapHistory.tsx        # previous N laps list
    DeltaBadge.tsx        # +/- vs previous lap, green/red
  registry.ts             # maps style name → Remotion composition + overlay dimensions
  Root.tsx                # registers all compositions with Remotion
```

Each style exports a component satisfying `(props: OverlayProps) => JSX.Element` plus an `{ width, height, x, y }` anchor consumed by the compositor for FFmpeg positioning.

Adding a new style: create `src/styles/<name>/index.tsx`, register in `registry.ts`. No other changes.

---

## Overlay timing logic (per frame)

```ts
const currentTime = frame / fps
const currentLap = getLapAtTime(timestamps, currentTime)
const lapElapsed = currentTime - currentLap.ytSeconds
const delta = lapElapsed - previousLap.lapTime   // negative = faster
```

---

## GT7 style

- **Panel:** `background: rgba(0,0,0,0.65)`, `backdropFilter: blur(12px)`, rounded corners
- **Timer font:** Orbitron (Google Fonts)
- **Delta colours:** green `#00FF87` (faster), red `#FF3B30` (slower), flash animation on lap change
- **Separator:** `1px rgba(255,255,255,0.15)` between history rows
- **Composition size:** `1200×760px` (2× scale for 4K placement)

---

## Video pipeline (`packages/compositor`)

1. `bundle()` the pre-built `apps/renderer` webpack output
2. `renderMedia()` → `overlay.mov` (ProRes 4444, alpha, 60fps)
3. FFmpeg composite:

```
ffmpeg
  -i source.mp4
  -i overlay.mov
  -filter_complex "[0:v][1:v]overlay=x=<x>:y=<y>"
  -r 60
  -c:v h264_videotoolbox
  -b:v 50M
  -c:a copy
  output.mp4
```

Overlay `x`/`y` position sourced from the style's registry entry — compositor has no hardcoded position.

---

## Turborepo pipeline

```
build:   core → scraper, timestamps, compositor → cli, renderer
render:  cli depends on renderer build output (bundle path)
```
