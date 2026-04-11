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
        Admin["apps/web-admin<br/><small>Next.js dashboard</small>"]
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

| Package | Description | Docs |
|---------|-------------|------|
| `@racedash/core` | Domain types and constants — no runtime dependencies | [README](packages/core/README.md) |
| `@racedash/scraper` | Fetches and parses timing data from AlphaTiming | [README](packages/scraper/README.md) |
| `@racedash/timestamps` | Offset parsing, lap timestamp calculation, and YouTube chapter formatting | [README](packages/timestamps/README.md) |
| `@racedash/compositor` | Remotion bundler/renderer abstraction, GPU detection, and FFmpeg codec validation | [README](packages/compositor/README.md) |
| `@racedash/engine` | Orchestration layer — composes scraper, timestamps, and compositor | [README](packages/engine/README.md) |
| `@racedash/db` | Drizzle ORM schema — PostgreSQL tables for users, licenses, credits, jobs | [README](packages/db/README.md) |

### Apps

| App | Description | Docs |
|-----|-------------|------|
| `@racedash/cli` | CLI commands: `drivers`, `timestamps`, `join`, `doctor`, `render` | [README](apps/cli/README.md) |
| `@racedash/desktop` | Electron app with project library, creation wizard, editor, and video preview | [README](apps/desktop/README.md) |
| `@racedash/renderer` | Remotion compositions for overlay styles (banner, esports, geometric-banner, minimal, modern) | [README](apps/renderer/README.md) |
| `@racedash/api` | Fastify REST API — deployed as AWS Lambda | [README](apps/api/README.md) |
| `@racedash/web-admin` | Next.js admin dashboard with Clerk auth | [README](apps/web-admin/README.md) |

### Infrastructure

| Component | Description | Docs |
|-----------|-------------|------|
| `@racedash/infra` | AWS CDK stacks, Lambda functions, Step Functions pipeline, LocalStack testing | [README](infra/README.md) |

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

The API runs on your host (not in Docker) with hot-reload. Docker provides the infrastructure it depends on: PostgreSQL and LocalStack (emulated AWS services).

| Service | Port |
|---------|------|
| API | 3000 |
| Admin dashboard | 3001 |
| PostgreSQL | 5433 |
| LocalStack | 4566 |

**1. Start infrastructure**

```bash
pnpm local:up       # Start Postgres + LocalStack (waits for readiness)
```

This creates S3 buckets, SQS queues, SES identity, and the Step Functions state machine automatically.

**2. Configure environment**

```bash
pnpm setup:env
```

An interactive script that generates `apps/api/.env.local`. LocalStack vars are auto-populated from `infra/localstack-init/env.localstack`. You'll be prompted for:

- **DATABASE_URL** — Press Enter to accept the default (`postgresql://racedash:racedash_local@localhost:5433/racedash_local`)
- **CLERK_SECRET_KEY** — From [dashboard.clerk.com](https://dashboard.clerk.com) → API Keys (starts with `sk_test_`)
- **CLERK_WEBHOOK_SECRET** — Optional. Needed for user sync. Requires ngrok (see Webhooks below)
- **STRIPE_SECRET_KEY** — From Stripe dashboard → Developers → API Keys (starts with `sk_test_`)
- **STRIPE_WEBHOOK_SECRET** — Optional. Use `stripe listen` CLI (see Webhooks below)
- **STRIPE_PRICE_\*** — From Stripe dashboard → Products → price IDs (starts with `price_`)
- **ADMIN_APP_ORIGIN** — URL of the admin app for CORS. Default `http://localhost:3001`

**3. Push the database schema**

```bash
DATABASE_URL="postgresql://racedash:racedash_local@localhost:5433/racedash_local" \
  pnpm drizzle-kit push --force
```

**4. Start the API**

```bash
cd apps/api && pnpm dev    # Runs on localhost:3000 with hot-reload
```

**5. Point the desktop app at the local API**

```bash
cp apps/desktop/.env.example apps/desktop/.env
# Set VITE_API_URL=http://localhost:3000
# Set VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### Webhooks (local)

The API receives webhooks from Clerk (user sync) and Stripe (payments). For local development, you need tunnels to forward these to your host.

**Clerk webhooks (ngrok):**

```bash
ngrok http 3000
```

Copy the `https://xxx.ngrok-free.app` URL, then in [dashboard.clerk.com](https://dashboard.clerk.com) → Webhooks → Add Endpoint:
- URL: `https://xxx.ngrok-free.app/api/webhooks/clerk`
- Events: `user.created`
- Copy the signing secret → set as `CLERK_WEBHOOK_SECRET` in `.env.local`

**Stripe webhooks (Stripe CLI):**

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI prints the webhook signing secret directly — set it as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

### Infrastructure commands

```bash
pnpm local:up              # Start Postgres + LocalStack
pnpm local:down            # Stop everything
pnpm local:fresh           # Wipe volumes and restart clean
pnpm local:logs            # Tail all container logs
pnpm local:logs:localstack # Tail LocalStack logs only
pnpm local:logs:postgres   # Tail Postgres logs only
pnpm local:version-check   # Warn if pinned LocalStack is outdated
pnpm local:ses             # Inspect sent emails in LocalStack
pnpm local:sfn:list        # List Step Functions executions
pnpm local:sfn:execute     # Start/check SFN executions
pnpm setup:env             # Interactive .env.local generator
```

### LocalStack integration tests

```bash
cd infra
pnpm localstack:up         # Start standalone LocalStack
pnpm test:local            # Run integration tests
pnpm test:local:watch      # Watch mode
pnpm localstack:down       # Stop container
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
