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
| `GET` | `/api/license` | Bearer token | License tier, status, and slot limit |
| `GET` | `/api/credits/balance` | Bearer token | Current credit balance |
| `GET` | `/api/credits/history` | Bearer token | Credit pack purchase history |
| `POST` | `/api/jobs` | Bearer token | Create a cloud render job (reserves credits) |
| `GET` | `/api/jobs` | Bearer token | List jobs for the current user |
| `GET` | `/api/jobs/:id` | Bearer token | Get job status |
| `POST` | `/api/jobs/:id/start-upload` | Bearer token | Initiate S3 multipart upload |
| `POST` | `/api/jobs/:id/complete-upload` | Bearer token | Complete S3 multipart upload |
| `GET` | `/api/jobs/:id/download` | Bearer token | Get signed CloudFront download URL |
| `POST` | `/api/stripe/checkout` | Bearer token | Create Stripe subscription checkout session |
| `GET` | `/api/stripe/portal` | Bearer token | Create Stripe billing portal session |
| `POST` | `/api/stripe/credits/checkout` | Bearer token | Create Stripe credit pack checkout session |
| `GET` | `/api/youtube/status` | Bearer token | YouTube connection status |
| `GET` | `/api/youtube/connect` | Bearer token | Start YouTube OAuth flow |
| `GET` | `/api/youtube/callback` | State JWT | YouTube OAuth callback |
| `DELETE` | `/api/youtube/disconnect` | Bearer token | Disconnect YouTube account |
| `POST` | `/api/social-upload` | Bearer token | Queue a completed render for YouTube upload |
| `GET` | `/api/social-uploads` | Bearer token | List social upload records |
| `POST` | `/api/webhooks/clerk` | Svix signature | Clerk `user.created` webhook |
| `POST` | `/api/webhooks/stripe` | Stripe signature | Stripe payment webhook |
| `POST` | `/api/webhooks/remotion` | HMAC secret | Remotion render completion webhook |
| `POST` | `/api/webhooks/render` | HMAC secret | Internal render pipeline status webhook |
| `GET` | `/api/admin/stats` | Admin role | Platform statistics |
| `GET` | `/api/admin/users` | Admin role | List all users |
| `GET` | `/api/admin/users/:id` | Admin role | User detail |
| `PATCH` | `/api/admin/users/:id/licenses` | Admin role | Update user license |
| `GET` | `/api/admin/jobs` | Admin role | List all jobs |
| `GET` | `/api/admin/credits` | Admin role | Credit ledger view |

## Testing

```bash
pnpm test
pnpm test:coverage
```

## Deployment

The API is deployed as an AWS Lambda function via `@fastify/aws-lambda`. The entry point exports `lambdaHandler` from `src/index.ts`. Infrastructure is managed by `infra/` (see `infra/README.md`).
