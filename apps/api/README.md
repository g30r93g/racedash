# @racedash/api

Fastify API server for RaceDash Cloud. Deployed as an AWS Lambda behind a Lambda Function URL. Locally, runs as a standard HTTP server.

## Local Development

### Prerequisites

- Node.js 20+
- pnpm
- Docker (for PostgreSQL + LocalStack)
- A [Clerk](https://clerk.com) account with an application set up

### 1. Start infrastructure

From the monorepo root:

```bash
pnpm local:up
```

This starts PostgreSQL (port 5433) and LocalStack (port 4566) with S3 buckets, SQS queues, SES, and the Step Functions state machine.

### 2. Push the database schema

```bash
DATABASE_URL="postgresql://racedash:racedash_local@localhost:5433/racedash_local" pnpm drizzle-kit push --force
```

### 3. Configure environment

```bash
pnpm setup:env    # from monorepo root
```

Interactive script that generates `apps/api/.env.local`. LocalStack vars are auto-populated. You'll be prompted for:

| Variable | Where to find it | Required? |
|---|---|---|
| `DATABASE_URL` | Press Enter for default (local Postgres) | Yes |
| `CLERK_SECRET_KEY` | dashboard.clerk.com → API Keys (`sk_test_...`) | Yes |
| `CLERK_WEBHOOK_SECRET` | Clerk Webhooks → signing secret (`whsec_...`) | For user sync |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys (`sk_test_...`) | For billing |
| `STRIPE_WEBHOOK_SECRET` | `stripe listen` CLI output (`whsec_...`) | For billing |
| `STRIPE_PRICE_*` | Stripe Dashboard → Products → price IDs (`price_...`) | For billing |
| `ADMIN_APP_ORIGIN` | Press Enter for default (`http://localhost:3001`) | Yes |

### 4. Start the server

```bash
pnpm dev
```

The API runs at `http://localhost:3000` with hot-reload. Verify:

```bash
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

### 5. Webhooks (optional)

The API receives webhooks from Clerk (user sync) and Stripe (payments). Needed for user creation and billing flows.

**Clerk** — requires ngrok:

```bash
ngrok http 3000
```

In dashboard.clerk.com → Webhooks → Add Endpoint → `https://xxx.ngrok-free.app/api/webhooks/clerk` → subscribe to `user.created` → copy signing secret to `CLERK_WEBHOOK_SECRET`.

**Stripe** — use the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI prints the signing secret — set as `STRIPE_WEBHOOK_SECRET`.

### 6. Build

```bash
pnpm build
```

Requires `@racedash/db` to be built first (`pnpm --filter @racedash/db build`).

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Health check |
| `GET` | `/api/auth/me` | Bearer token | Current user profile + license tier |
| `POST` | `/api/webhooks/clerk` | Svix signature | Clerk webhook receiver |

## Testing

```bash
pnpm test
```

## Deployment

The API is deployed as an AWS Lambda function via `@fastify/aws-lambda`. The entry point exports `lambdaHandler` from `src/index.ts`. Infrastructure is managed by `feature/cloud-infra`.
