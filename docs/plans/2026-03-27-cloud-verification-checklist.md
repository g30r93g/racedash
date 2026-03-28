# Cloud Epic — Verification Checklist

## What's Done (Verified Manually)

- [x] Local infrastructure: `pnpm local:up` starts Postgres + LocalStack
- [x] LocalStack resources: S3 buckets, SQS queues, SES identity, Step Functions state machine
- [x] API boots and connects to Postgres + LocalStack
- [x] API health check: `GET /api/health` → 200
- [x] DB schema push: `drizzle-kit push` creates all tables
- [x] Clerk sign-up: custom form with email + password + verification code
- [x] Clerk sign-in: custom form with email + password + MFA/client trust challenge
- [x] Clerk webhook: `user.created` → user row in DB (via ngrok)
- [x] Session token sync: Clerk SDK → IPC → main process `fetchWithAuth`
- [x] Profile fetch: `/api/auth/me` returns user + license
- [x] Stripe checkout: Plus subscription purchase via test card (4242...)
- [x] Stripe webhook: `checkout.session.completed` → license row in DB
- [x] License reflects in desktop UI after purchase
- [x] 4K/120fps unlocked for licensed users
- [x] Render destination defaults to Cloud for licensed users
- [x] Sign-out clears session + UI returns to signed-out state
- [x] Local rendering still works (no regression)
- [x] Prettier formatting: all files pass `format:check`
- [x] ESLint: 0 errors (395 warnings — all `no-explicit-any`)
- [x] Admin dashboard: boots on port 3001 with Clerk admin role

## What Needs Testing

### Auth - Desktop
- [x] Session persistence across app restart (close desktop, reopen → still signed in)
- [x] Sign-in from cleared cookies (client trust challenge flow end-to-end)
- [x] Sign-out → sign-in with same account (full cycle)
- [x] Token refresh during long session (leave app open >60s, make API call)

### Billing
- [x] Pro subscription purchase
- [x] Credit pack purchase (50 / 100 / 250 / 500 RC)
- [x] Stripe customer portal (manage subscription)
- [ ] Subscription cancellation flow
- [x] Credit balance display in desktop app
- [x] Credit history display in desktop app

### Cloud Rendering
- [ ] Create cloud render job from desktop
- [ ] Video upload to S3 (multipart upload flow)
- [ ] Upload progress tracking in desktop UI
- [ ] SSE job status streaming
- [ ] Render download after completion
- [ ] Credit deduction after render
- [ ] Render cancellation
- [ ] Error handling — insufficient credits

### YouTube Integration
- [ ] YouTube OAuth connect flow
- [ ] YouTube upload (social upload dispatch)
- [ ] YouTube disconnect

### Admin Dashboard
- [x] Overview page — stats render correctly
- [x] Jobs list with filters (status, date range)
- [ ] Job detail page
- [x] User list with search
- [ ] User detail page — license, credits, jobs
- [ ] Issue/revoke license from admin
- [ ] Credit adjustment from admin

### Infrastructure (AWS)
- [x] CDK synth — templates generate without errors (5 stacks)
- [x] CDK diff — review changes against current state (5 stacks with differences)
- [x] LocalStack integration tests pass (`pnpm test:local`) — 5 suites, 13 passed, 4 todo
- [x] CDK unit/snapshot tests pass (`cd infra && pnpm test`) — 14 suites, 84 tests

### Test Suite
- [ ] Fix desktop auth test (`registerAuthHandlers` → `registerTokenHandlers`)
- [ ] Fix desktop stripe-checkout test (`didNavigateCallback` scope)
- [ ] Fix infra test failures
- [ ] All packages pass: `pnpm test`

### Documentation
- [x] README updated with local dev setup
- [x] API README updated with setup:env workflow
- [x] Per-package/app/infra READMEs written (12 files)
- [x] Root README links to all per-package docs
- [ ] Document cloud deployment steps (CDK deploy, env vars, DNS)
- [ ] Document production Clerk configuration (custom domain, webhooks)
- [ ] Document production Stripe configuration (live keys, webhook endpoints)

## What's Not In Scope (Post-Merge)

These are features/tasks to track in Linear after merging the epic branch:

- Remotion renderer integration (the actual overlay rendering in Lambda)
- MediaConvert video composition
- ECS YouTube upload task container
- Production deployment pipeline (CI/CD)
- Custom Clerk domain setup (accounts.racedash.io)
- Monitoring/alerting (CloudWatch, error tracking)
- Email templates for SES notifications
- Fade configuration in CLI (the 3 TODOs)
