# @racedash/desktop

Electron app for local and cloud-assisted video overlay rendering. Includes a project library, creation wizard, editor, video preview, and cloud render/upload flows.

## Overview

The renderer process hosts a React + Remotion player UI. The main process handles all heavy work via IPC: engine operations (scraper, timestamps, render), FFmpeg compositing, Clerk auth token management, Stripe checkout, and cloud render/YouTube upload flows.

## Local Development

### Prerequisites

- Node.js 20+, pnpm
- FFmpeg on `PATH` (bundled `ffmpeg-static` is used as fallback)
- API running at `http://localhost:3000` for cloud features (optional)

### Setup

```bash
cp apps/desktop/.env.example apps/desktop/.env
# Edit .env — set VITE_API_URL and VITE_CLERK_PUBLISHABLE_KEY
```

### Start

```bash
# From monorepo root
pnpm desktop:dev

# Or from the package directly
pnpm --filter @racedash/desktop dev
```

### Build distributable

```bash
pnpm --filter @racedash/desktop dist
```

## Environment Variables

Create `apps/desktop/.env` (copy from `.env.example`):

| Variable | Description | Required |
|---|---|---|
| `VITE_API_URL` | Base URL of the RaceDash API | For cloud features |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_...`) | For auth + cloud features |

## Architecture

Built with electron-vite. Three processes:

| Process | Location | Purpose |
|---|---|---|
| Main | `src/main/` | IPC handlers, engine calls, auth, cloud, Stripe, YouTube |
| Preload | `src/preload/` | Context bridge — exposes typed `window.racedash` API to renderer |
| Renderer | `src/renderer/` | React UI: project library, wizard, editor, video preview |

Key main-process files:

| File | Purpose |
|---|---|
| `ipc.ts` | Core IPC handlers: file I/O, project management, render, timestamps, drivers |
| `auth.ts` | Clerk token storage using Electron `safeStorage` |
| `cloud-render-handlers.ts` | Multipart S3 upload, job creation, download |
| `stripe-checkout.ts` | Opens Stripe checkout in a modal `BrowserWindow` |
| `youtube.ts` | YouTube OAuth connection and upload IPC handlers |
| `license-cache.ts` | Caches license/credit info locally to avoid repeated API calls |
| `projectRegistry.ts` | Persists project metadata to disk |
| `ffmpeg.ts` | Resolves bundled or system FFmpeg/ffprobe paths |

## Testing

```bash
pnpm --filter @racedash/desktop test
pnpm --filter @racedash/desktop test:coverage
```

Uses Vitest with `--pool forks`. Tests cover IPC helper logic; Electron APIs are mocked. Dependency packages are built first via the `pretest` script.

## Deployment / Productionising

Package with electron-builder:

```bash
pnpm --filter @racedash/desktop dist
```

The `electron-builder.config.ts` controls targets (macOS, Windows). Auto-update is handled by `electron-updater` (`updater.ts`). Set `VITE_API_URL` to the production API URL and `VITE_CLERK_PUBLISHABLE_KEY` to the production Clerk key before building.
