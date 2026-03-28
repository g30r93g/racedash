# @racedash/admin

Next.js admin dashboard for RaceDash Cloud. Restricted to users with the Clerk `admin` role.

## Overview

Provides an internal dashboard for viewing users, managing licenses, and inspecting cloud render jobs. Authenticates via Clerk and proxies data requests to the API.

## Local Development

### Prerequisites

- API running at `http://localhost:3000` (see `apps/api/README.md`)
- Clerk publishable key

### Start

```bash
cd apps/admin
pnpm dev    # starts on http://localhost:3001
```

### Build

```bash
pnpm --filter @racedash/admin build
```

## Environment Variables

The admin app picks up Clerk configuration from Next.js environment variable conventions. Create `apps/admin/.env.local`:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_...`) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_...`) |

## Architecture

Next.js App Router. Key routes:

| Route | Purpose |
|---|---|
| `/` | Dashboard home |
| `/users` / `/users/[id]` | User listing and detail |
| `/jobs` / `/jobs/[id]` | Render job listing and detail |
| `/sign-in` | Clerk-hosted sign-in redirect |
| `/access-denied` | Shown to authenticated non-admin users |

Middleware (`middleware.ts`) enforces Clerk authentication on all routes except `/sign-in` and `/access-denied`. Admin role enforcement is done in `layout.tsx` by checking the Clerk session.

UI uses Tailwind CSS v4, Shadcn/ui components (via `@base-ui/react`), and Lucide icons.

## Testing

```bash
pnpm --filter @racedash/admin test
pnpm --filter @racedash/admin test:coverage
```

Uses Vitest with `@testing-library/react` and jsdom.

## Deployment / Productionising

Deploy as a standard Next.js application (Vercel, or any Node.js host). Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in the host environment. The admin app does not connect to the database directly — all data flows through the API.
