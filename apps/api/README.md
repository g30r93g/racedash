# @racedash/api

Fastify API server for RaceDash Cloud. Deployed as an AWS Lambda behind a Lambda Function URL. Locally, runs as a standard HTTP server.

## Local Development

### Prerequisites

- Node.js 24+
- pnpm
- Docker (for PostgreSQL)
- A [Clerk](https://clerk.com) account with an application set up

### 1. Start the Database

From the monorepo root:

```bash
cd packages/db
docker compose -f docker-compose.local.yml up -d
```

This starts PostgreSQL 16 on port 5433 with persistent storage.

Push the schema:

```bash
DATABASE_URL="postgresql://racedash:racedash_local@localhost:5433/racedash_local" pnpm drizzle-kit push --force
```

### 2. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Where to find it |
|---|---|
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys → Secret key (`sk_test_...`) |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard → Webhooks → your endpoint → Signing Secret (`whsec_...`) |
| `DATABASE_URL` | Use `postgresql://racedash:racedash_local@localhost:5433/racedash_local` for local Docker |

### 3. Set Up Clerk Webhook (optional for local dev)

If you need to test webhook events locally:

1. Install [ngrok](https://ngrok.com) and start a tunnel: `ngrok http 3001`
2. In Clerk Dashboard → Webhooks → Add Endpoint, set the URL to `https://<id>.ngrok.io/api/webhooks/clerk`
3. Subscribe to `user.created`
4. Copy the signing secret into your `.env`

### 4. Start the Server

```bash
pnpm dev
```

The API runs at `http://localhost:3001`. Verify with:

```bash
curl http://localhost:3001/api/health
# → {"status":"ok"}
```

### 5. Build

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
