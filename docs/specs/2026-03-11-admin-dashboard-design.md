# RaceDash Admin Dashboard — Design Spec

**Date:** 2026-03-11
**Status:** Draft
**Depends on:** `2026-03-11-aws-productionization-design.md`

---

## Overview

A private admin dashboard embedded in the existing `apps/web` Next.js application. Provides the platform operator with system health monitoring, job run statistics, credit oversight, and cost profiling (RC revenue vs actual AWS spend). Accessible only to Clerk users with `publicMetadata.role === 'admin'`.

This spec is sequenced after the core productionisation spec — the admin dashboard is built once the DB, pipeline, and credit system are in place.

---

## Architecture

### Placement

A new `(admin)` route group inside `apps/web/app/`. Uses the same Next.js app, the same Neon DB connection, and the same Vercel deployment as the user-facing app. No separate deployment.

### Route Structure

```
app/
  (admin)/
    layout.tsx              ← Clerk admin role guard; redirects non-admins to /
    admin/
      page.tsx              ← Overview: system health + pipeline summary
      jobs/page.tsx         ← Run statistics: job counts + job list
      credits/page.tsx      ← Credit oversight: balances + expiry buckets
      costs/page.tsx        ← Cost profiling: RC revenue vs AWS spend
```

### Data Fetching

Pages are Next.js server components. Each page calls its data sources directly at render time:

- **Neon (Drizzle)**: job counts, credit balances, purchase history
- **CloudWatch** (`@aws-sdk/client-cloudwatch`): Lambda error rates, Step Functions failures, SQS DLQ depth, ECS task failures
- **Cost Explorer** (`@aws-sdk/client-cost-explorer`): actual AWS spend by service, filtered by project tag

`<Suspense>` boundaries wrap the slow AWS SDK calls (CloudWatch, Cost Explorer) so DB-backed sections render immediately while infra metrics load. Each page includes a `<RefreshButton />` client component that calls `router.refresh()` to re-fetch all data on demand.

### Auth Guard

`apps/web/app/(admin)/layout.tsx`:

```ts
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { sessionClaims } = await auth()
  if (sessionClaims?.publicMetadata?.role !== 'admin') redirect('/')
  return <>{children}</>
}
```

To grant admin access: set `publicMetadata: { role: 'admin' }` on the relevant Clerk user via the Clerk dashboard.

### IAM additions

Two read-only permissions added to the existing Vercel IAM user policy:

```json
{
  "Effect": "Allow",
  "Action": ["cloudwatch:GetMetricData", "ce:GetCostAndUsage"],
  "Resource": "*"
}
```

---

## Pages

### `/admin` — Overview

**Purpose**: at-a-glance platform health. First stop when something looks wrong.

**DB data** (fast, renders immediately):
- Jobs currently in-flight: count by status (`uploading`, `queued`, `joining`, `rendering`, `compositing`)
- Jobs completed and failed today (since midnight UTC)
- 7-day failure rate: `failed / (complete + failed)` as a percentage

**CloudWatch data** (via `GetMetricData`, last 24h, 1-hour resolution):
- `AWS/Lambda` → `Errors` sum per function, one `MetricDataQuery` per function name. Function names are known at deploy time (pipeline Lambdas, relay Lambda, validation Lambda) and stored in a `LAMBDA_FUNCTION_NAMES` env var (comma-separated list, populated from CDK stack outputs). Tag-based filtering is not supported for `AWS/Lambda` namespace metrics — dimension is `FunctionName` only.
- `AWS/States` → `ExecutionsFailed` + `ExecutionsTimedOut` dimensioned by `StateMachineArn` (uses existing `STEP_FUNCTIONS_STATE_MACHINE_ARN` env var)
- `AWS/SQS` → `ApproximateNumberOfMessagesVisible` dimensioned by `QueueName` on the social upload DLQ. Queue name extracted at runtime from `SQS_SOCIAL_UPLOAD_DLQ_URL` as the last path segment (SQS URL format: `https://sqs.{region}.amazonaws.com/{accountId}/{queueName}`).
- **Joining tasks** (DB-derived, not CloudWatch): count of jobs with `status = 'joining'` — `AWS/ECS` `RunningTaskCount` is only emitted for ECS Services, not for one-off `RunTask` invocations. The DB status is the correct signal here and is already present in the in-flight DB data section above.

**Layout**: metric cards row (in-flight by status, completed today, failed today, failure rate), then a CloudWatch health row (Lambda errors, SFN failures, DLQ depth). Below: a table of the 10 most recent failed jobs with their `error_message`.

---

### `/admin/jobs` — Run Statistics

**Purpose**: understand throughput, diagnose failures, inspect individual jobs.

**DB data**:
- Job counts grouped by status (all-time and filtered by time range)
- Job table: `id`, user email (join to `users`), `status`, `rc_cost` (shown as `—` for non-terminal jobs where `FinaliseJob` has not yet written the value; `credit_reservations.rc_amount` is not used as a display fallback — the reservation amount is an internal detail), `created_at`, derived duration (`updated_at - created_at` for terminal states), `error_message`
- The query filters to render jobs only: `WHERE jobs.id NOT LIKE 'su_%'` is not needed on `jobs` (the `jobs` table contains only render job IDs), but any join to `credit_reservations` must use `WHERE credit_reservations.job_id = jobs.id` (bare UUID match) to avoid accidental inclusion of social upload reservation rows (`su_` prefixed `job_id`s have no matching `jobs` row and will be dropped by an inner join — no special handling needed)
- Time range filter: last 7 days / 30 days / all time (query param `?range=7d|30d|all`)

**No CloudWatch or Cost Explorer on this page** — purely DB-derived.

---

### `/admin/credits` — Credit Oversight

**Purpose**: understand the total credit liability, identify upcoming expiries, and review purchase history.

**DB data**:

**Expiry buckets** (query against `credit_packs` where `rc_remaining > 0`):

| Bucket | Condition |
|---|---|
| Active > 90d | `expires_at > now() + 90 days` |
| Expiring 30–90d | `expires_at BETWEEN now() + 30 days AND now() + 90 days` |
| Expiring 7–30d | `expires_at BETWEEN now() + 7 days AND now() + 30 days` |
| Expiring < 7d | `expires_at BETWEEN now() AND now() + 7 days` |
| Expired (RC remaining) | `expires_at < now() AND rc_remaining > 0` |

Each bucket shows: number of packs, total RC remaining, estimated £ liability at blended rate.

**All-time totals**:
- Total RC sold: `SUM(rc_total)` across all `credit_packs`
- Total RC consumed (authoritative): `SUM(crp.rc_deducted) FROM credit_reservation_packs crp JOIN credit_reservations cr ON crp.reservation_id = cr.id WHERE cr.status = 'consumed'` — using the reservation ledger rather than pack arithmetic avoids double-counting with forfeited credits
- Total RC expired (forfeited): `SUM(rc_remaining) FROM credit_packs WHERE expires_at < now() AND rc_remaining > 0` — credits remaining in expired packs that can no longer be restored

**Purchase history table**: `pack_name`, `rc_total`, `price_gbp`, `purchased_at`, user email — newest first, paginated 50 rows.

---

### `/admin/costs` — Cost Profiling

**Purpose**: understand gross margin per time period and per resolution tier. Identify whether pricing covers actual infra spend.

**Time range selector**: last 7d / 30d / 90d (query param `?range=7d|30d|90d`). Defaults to 30d.

**DB data** (revenue side, render jobs only):
- RC consumed per time period from `credit_reservations` (status `consumed`), filtered to render jobs only: `WHERE credit_reservations.job_id NOT LIKE 'su\_%' ESCAPE '\'`. Social upload RC (10 RC flat at a fixed rate) does not correspond to AWS render spend and must be excluded from the margin calculation to avoid inflating the gross margin figure.
- Join path: `credit_reservations` → `credit_reservation_packs` → `credit_packs` to obtain `price_gbp` and `rc_total` per pack. A single reservation may span multiple packs (FIFO depletion) — the join must go through `credit_reservation_packs`.
- Derived £ revenue: `SUM(rc_deducted × (price_gbp / rc_total))` grouped by day
- Breakdown by resolution tier: join to `jobs` and extract `width` from `jobs.config` JSONB, group RC consumed by `width >= 3840` (UHD) vs below (HD)

**Cost Explorer data** (`GetCostAndUsage`, `GroupBy: SERVICE`, filtered by tag `racedash:project=racedash`):
- Returns daily spend per AWS service. Exact billing service name strings (must match exactly for display mapping):
  - `"AWS Lambda"`
  - `"AWS Elemental MediaConvert"`
  - `"Amazon Elastic Container Service"`
  - `"Amazon Simple Storage Service"`
  - `"Amazon Simple Email Service"`
- 24h delay (Cost Explorer billing data latency) — displayed in UI as "AWS data as of [yesterday's date]"
- **Currency**: Cost Explorer returns amounts in the AWS account's billing currency (USD for most accounts). Amounts are displayed in USD with a static note "converted at ~0.79 USD/GBP" for v1 margin estimates. No live FX rate fetch. This is a known approximation — revisit if GBP margin accuracy becomes important.

**Displayed metrics**:
- Total RC revenue (£) for period
- Total AWS spend (USD, ~GBP equivalent) for period (Cost Explorer)
- Estimated gross margin (%)
- Service cost breakdown table (Lambda / MediaConvert / ECS / S3 / SES) — display names mapped from the Cost Explorer billing strings above
- Daily revenue vs spend table (rendered as an HTML table — no chart library dependency in v1)

**Limitations noted in UI**:
- Lambda costs cannot be attributed per job (Lambda doesn't support per-invocation tagging). MediaConvert and ECS task costs are tagged with `racedash:job-id` and are attributable individually. Lambda costs are shown as a fleet total for the period.
- The `racedash:project=racedash` tag filter in Cost Explorer returns Lambda costs only if the AWS account is dedicated to RaceDash (no other Lambda workloads). For shared accounts, Lambda costs appear as an aggregate service line regardless of tag filtering. The spec assumes a dedicated AWS account for v1 — revisit if the account hosts other workloads.

---

## Tagging Strategy

### CDK Stack Tags

`infra/bin/app.ts` applies tags to all stacks:

```ts
import { Tags } from 'aws-cdk-lib'

const app = new cdk.App()
const env = app.node.tryGetContext('env') ?? 'prod'

const stacks = [storageStack, pipelineStack, renderStack, notificationsStack]
for (const stack of stacks) {
  Tags.of(stack).add('racedash:project', 'racedash')
  Tags.of(stack).add('racedash:environment', env)
}
```

This propagates to all Lambda functions, ECS task definitions, SQS queues, S3 buckets, and Step Functions state machines created in those stacks.

### Per-Job Tags

**MediaConvert** (`CreateMediaConvertJob` Lambda): add `userMetadata` to the MediaConvert job submission:

```ts
await mediaConvert.send(new CreateJobCommand({
  // ...existing fields...
  UserMetadata: {
    'racedash:job-id': jobId,
    'racedash:project': 'racedash',
  },
}))
```

**ECS Fargate join task** (`JoinFootage` Step Functions state): add tags in the `ECS:runTask` resource parameters:

```json
"Tags": [
  { "Key": "racedash:job-id", "Value.$": "$.jobId" },
  { "Key": "racedash:project", "Value": "racedash" }
]
```

These tags enable Cost Explorer to return per-job spend for MediaConvert and ECS tasks. Lambda costs remain fleet-level.

---

## Cross-Cutting Changes to Productionisation Spec

These changes to existing infrastructure are required for the admin dashboard:

1. **CDK stack tags** — `Tags.of(stack)` calls in `infra/bin/app.ts` (described above)
2. **MediaConvert job tags** — `UserMetadata` added in `CreateMediaConvertJob` Lambda
3. **ECS RunTask tags** — `Tags` array in the `JoinFootage` Step Functions state definition
4. **IAM policy** — `cloudwatch:GetMetricData` and `ce:GetCostAndUsage` added to Vercel IAM user
5. **Clerk admin user** — set `publicMetadata: { role: 'admin' }` on the operator's Clerk account post-deploy
6. **CDK CfnOutputs** — `PipelineStack` exports two new outputs: (a) `LambdaFunctionNames` (comma-separated real function names for `LAMBDA_FUNCTION_NAMES`); (b) `SocialUploadDlqUrl` (for `SQS_SOCIAL_UPLOAD_DLQ_URL`)

---

## New Packages

```
apps/web/
  package.json ← add @aws-sdk/client-cloudwatch, @aws-sdk/client-cost-explorer
```

Both SDK clients are instantiated in server components only — never shipped to the client bundle.

---

## Environment Variables

New variables required (added to Vercel, populated from CDK stack outputs):

```
LAMBDA_FUNCTION_NAMES     Comma-separated string of actual Lambda function names for CloudWatch
                          error monitoring. Value is a single CDK CfnOutput exported from
                          PipelineStack containing all monitored function names joined with ",".
                          The 12 monitored functions (CDK logical IDs → actual names at deploy time):
                            validation, start-render-overlay, wait-for-remotion,
                            create-mediaconvert-job, wait-for-mediaconvert,
                            finalise-job, release-credits-and-fail,
                            notify-user, log-notify-error,
                            eventbridge-relay, social-upload-dispatch, social-upload-dlq
                          CDK auto-generates actual function names (e.g. "racedash-validation-prod").
                          The single CfnOutput value must contain the real generated names, not
                          logical IDs. The admin page splits on "," and issues one MetricDataQuery
                          per name — no name-to-ID mapping needed.

SQS_SOCIAL_UPLOAD_DLQ_URL URL of the social upload dead-letter queue (consistent with the
                          SQS_SOCIAL_UPLOAD_QUEUE_URL naming convention). Queue name is extracted
                          at runtime as the last path segment of the URL.
                          Added as a new CDK CfnOutput in PipelineStack (cross-cutting change #6).
```

Reused from existing productionisation spec:
- `DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `STEP_FUNCTIONS_STATE_MACHINE_ARN` (used for CloudWatch `AWS/States` dimension)

---

## Out of Scope (v1)

- Real-time metrics (SSE, WebSockets) — manual refresh is sufficient for a personal dashboard
- Alerting / PagerDuty integration — CloudWatch alarms can be added independently
- Per-user admin views or multi-admin support — single admin role is sufficient
- Exporting data to CSV — can be added later if needed
- Chart libraries (Chart.js, Recharts) — HTML tables cover v1 needs; revisit when trends analysis is more important
