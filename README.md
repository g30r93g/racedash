# RaceDash

Timing data extraction, YouTube chapter generation, and lap timer overlay rendering for race footage — available as a CLI tool and a desktop app.

## Architecture

```mermaid
graph TB
    subgraph Apps
        CLI["apps/cli<br/><small>CLI tool</small>"]
        Desktop["apps/desktop<br/><small>Electron app</small>"]
        Renderer["apps/renderer<br/><small>Remotion compositions</small>"]
    end

    subgraph Packages
        Engine["packages/engine<br/><small>Orchestration layer</small>"]
        Core["packages/core<br/><small>Domain types</small>"]
        Scraper["packages/scraper<br/><small>Web scraping</small>"]
        Timestamps["packages/timestamps<br/><small>Timestamp calculation</small>"]
        Compositor["packages/compositor<br/><small>Remotion bundler + renderer</small>"]
    end

    CLI --> Engine
    Desktop --> Engine
    Desktop --> Renderer
    Renderer --> Timestamps
    Renderer --> Core
    Engine --> Scraper
    Engine --> Timestamps
    Engine --> Compositor
    Engine --> Core
    Scraper --> Core
    Timestamps --> Core
    Compositor --> Core

    subgraph Cloud["Cloud"]
        API["apps/api<br/><small>Fastify REST API</small>"]
        Admin["apps/admin<br/><small>Next.js dashboard</small>"]
        DB["packages/db<br/><small>Drizzle ORM schema</small>"]
        Infra["infra/<br/><small>AWS CDK stacks</small>"]
    end

    Desktop -.->|"authenticated fetch"| API
    API --> DB
    Admin --> DB
    Infra --> API

    subgraph AWS["AWS Services"]
        S3["S3<br/><small>Uploads + renders</small>"]
        StepFn["Step Functions<br/><small>Render pipeline</small>"]
        Lambda["Lambda<br/><small>Pipeline tasks</small>"]
        SQS["SQS<br/><small>Social upload queue</small>"]
        SES["SES<br/><small>Email notifications</small>"]
        CloudFront["CloudFront<br/><small>Signed URL downloads</small>"]
        MediaConvert["MediaConvert<br/><small>Video processing</small>"]
    end

    API -.-> S3
    API -.-> StepFn
    StepFn -.-> Lambda
    Lambda -.-> S3
    Lambda -.-> SQS
    Lambda -.-> SES
    Lambda -.-> MediaConvert
    CloudFront -.-> S3
```

### Package overview

| Package | Description |
|---------|-------------|
| `@racedash/core` | Domain types and constants — no runtime dependencies |
| `@racedash/scraper` | Fetches and parses timing data from Speedhive, AlphaTiming, and email reports |
| `@racedash/timestamps` | Offset parsing, lap timestamp calculation, and YouTube chapter formatting |
| `@racedash/compositor` | Remotion bundler/renderer abstraction, GPU detection, and FFmpeg codec validation |
| `@racedash/engine` | Orchestration layer — composes scraper, timestamps, and compositor into a pipeline |
| `@racedash/cli` | CLI commands: `drivers`, `timestamps`, `join`, `doctor`, `render` |
| `@racedash/desktop` | Electron app with project library, creation wizard, editor, and video preview |
| `@racedash/renderer` | Remotion compositions for overlay styles (banner, esports, geometric-banner, minimal, modern) |

---

## Prerequisites

| Tool | Install | Verify |
|------|---------|--------|
| **Node.js** v20+ | [nodejs.org](https://nodejs.org) (LTS) | `node --version` |
| **pnpm** | `npm install -g pnpm` | `pnpm --version` |
| **FFmpeg** | macOS: `brew install ffmpeg` · Windows: `winget install ffmpeg` · Linux: `sudo apt install ffmpeg` | `ffmpeg -version` |

> Windows support for `racedash render` is experimental. The Windows render path uses a transparent VP9 WebM overlay internally, so ProRes support is not required.

---

## Getting started

```bash
git clone https://github.com/your-org/racedash.git
cd racedash
pnpm install
```

---

## Local development

### CLI

```bash
# Run any CLI command
pnpm racedash <command> [options]

# Examples
pnpm racedash drivers --config ./session.json
pnpm racedash timestamps --config ./session.json
pnpm racedash render --config ./session.json --video ./race.mp4
```

### Desktop app

```bash
pnpm desktop:dev
```

### Build and test

```bash
pnpm turbo build       # Build all packages
pnpm turbo test        # Run tests across all packages
pnpm turbo typecheck   # Type-check everything
pnpm lint              # Lint
```

### Cloud services (local)

To run the API and its dependencies locally:

**1. Start the database**

```bash
docker compose -f packages/db/docker-compose.local.yml up -d
```

**2. Push the schema**

```bash
DATABASE_URL="postgresql://racedash:racedash_local@localhost:5433/racedash_local" \
  pnpm drizzle-kit push --force
```

**3. Configure environment**

```bash
cp apps/api/.env.example apps/api/.env
# Fill in: CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET, DATABASE_URL, STRIPE_SECRET_KEY
```

**4. Start the API** (runs on `localhost:3001`)

```bash
pnpm --filter @racedash/api dev
```

**5. Point the desktop app at the local API**

```bash
cp apps/desktop/.env.example apps/desktop/.env
# Set VITE_API_URL=http://localhost:3001
# Set VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### LocalStack (AWS emulation)

Run integration tests against emulated AWS services (S3, SQS, SES, Step Functions, EventBridge) without real AWS credentials:

```bash
cd infra
pnpm localstack:up         # Start LocalStack container
pnpm test:local            # Run integration tests
pnpm test:local:watch      # Watch mode
pnpm localstack:down       # Stop container
pnpm localstack:reset      # Restart fresh
```

---

## CLI reference

All commands follow the pattern `pnpm racedash <command> [options]`.

### Session config

Commands that accept `--config` read a JSON file describing one or more session segments. Each segment declares a `source`:

| Source | Input | Notes |
|--------|-------|-------|
| `alphaTiming` | URL to AlphaTiming results page | |
| `mylapsSpeedhive` | Speedhive session URL | |
| `teamsportEmail` | Path to saved `.eml` file | |
| `daytonaEmail` | Path to saved `.eml` file | 2025/2026 Clubspeed format |
| `manual` | Inline `timingData` array | Fallback when no integration is available |

<details>
<summary>Example config</summary>

```json
{
  "driver": "Surrey A",
  "segments": [
    {
      "source": "alphaTiming",
      "mode": "practice",
      "url": "https://results.alphatiming.co.uk/club/e/1/s/2/laptimes",
      "offset": "2:15.000",
      "label": "Practice"
    },
    {
      "source": "teamsportEmail",
      "mode": "qualifying",
      "emailPath": "./results/teamsport-session.eml",
      "offset": "17:42.500",
      "label": "Qualifying"
    },
    {
      "source": "mylapsSpeedhive",
      "mode": "race",
      "url": "https://speedhive.mylaps.com/sessions/11791523",
      "offset": "31:05.000",
      "label": "Race"
    },
    {
      "source": "manual",
      "mode": "race",
      "offset": "1:05:30.000",
      "label": "Fallback",
      "timingData": [
        { "lap": 0, "time": "0:14.500" },
        { "lap": 1, "time": "1:02.115" },
        { "lap": 2, "time": "1:01.884" }
      ]
    }
  ]
}
```

</details>

### `racedash drivers`

Lists drivers discovered across configured segments.

```bash
pnpm racedash drivers --config ./session.json
pnpm racedash drivers --config ./session.json --driver "Surrey A"
```

| Flag | Description | Required |
|------|-------------|----------|
| `--config <path>` | Session config JSON | Yes |
| `--driver <name>` | Highlight a specific driver | No |

### `racedash timestamps`

Prints YouTube chapter timestamps. Requires `driver` in the config.

```bash
pnpm racedash timestamps --config ./session.json
```

| Flag | Description | Required |
|------|-------------|----------|
| `--config <path>` | Session config JSON | Yes |
| `--fps <n>` | Video FPS for frame-count offsets (e.g. `"12345 F"`) | No |

**What is `offset`?** The point in your video where the segment starts — typically when the driver crosses the line to begin lap 1. Use `"12345 F"` format with `--fps` if you have a frame number instead.

### `racedash join`

Lossless concatenation of GoPro chapter files.

```bash
pnpm racedash join GH010001.MP4 GH020001.MP4 --output race.mp4
```

### `racedash doctor`

Inspects your FFmpeg setup, GPU capabilities, and available encoders.

```bash
pnpm racedash doctor
```

### `racedash render`

Renders a lap timer overlay onto video.

```bash
pnpm racedash render --config ./session.json --video ./race.mp4 --output ./race-out.mp4
```

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Session config JSON | _(required)_ |
| `--video <path>` | Source video file | _(required)_ |
| `--output <path>` | Output path | `./out.mp4` |
| `--style <name>` | Overlay style: `banner`, `esports`, `geometric-banner`, `minimal`, `modern` | `banner` |
| `--overlay-x <n>` | Horizontal position (px) | `0` |
| `--overlay-y <n>` | Vertical position (px) | `0` |
| `--box-position <pos>` | Position for esports/minimal/modern | style-dependent |
| `--output-resolution <preset>` | `1080p`, `1440p`, or `2160p` | video resolution |
| `--qualifying-table-position <pos>` | Corner for qualifying table | config default |
| `--label-window <seconds>` | Label display duration around segment offset | `15` |
| `--no-cache` | Force overlay re-render | `false` |
| `--only-render-overlay` | Render overlay without compositing onto source | `false` |

#### Overlay styles

| Style | Description |
|-------|-------------|
| **banner** | Full-width top bar with accent band and central lap timer. Practice/qualifying: last-lap and session-best panels flanking the timer. Race: position counter and lap counter only. Timer background flashes purple/green/red on lap completion. Configurable accent, text, and timer colours. |
| **esports** | Floating card (default: bottom-left) with gradient accent bar, position badge, and lap counter. Two icon-badged time panels (last lap, session best) above a current elapsed time bar. |
| **geometric-banner** | Full-width top bar with five coloured SVG polygon sections. Each section holds a data point (position, last lap, timer, previous lap, lap count). In race mode, collapses to three sections. Timer section flashes with lap performance colours. |
| **minimal** | Compact floating card (default: bottom-left) with a lap number badge, large italic elapsed time, and three stat columns (position, last lap, session best). Same layout across all modes. |
| **modern** | Horizontal bar (default: bottom-centre) with a subtle diagonal stripe pattern. Large elapsed time on the left, position/last lap/session best stats on the right separated by a thin divider. |
