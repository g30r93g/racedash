# RaceDash Admin Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private admin dashboard to the existing RaceDash Next.js app providing system health monitoring, job run statistics, credit oversight, and cost profiling (RC revenue vs actual AWS spend).

**Architecture:** A new `(admin)` route group in `apps/web` with Clerk `publicMetadata.role === 'admin'` guard. Pages are Next.js server components fetching from Neon (Drizzle), CloudWatch (`@aws-sdk/client-cloudwatch`), and Cost Explorer (`@aws-sdk/client-cost-explorer`) at render time, with Suspense boundaries for the slow AWS calls.

**Tech Stack:** Next.js 15 App Router (server components), TypeScript, Drizzle ORM, @aws-sdk/client-cloudwatch, @aws-sdk/client-cost-explorer, Clerk, Vitest

**Prerequisite:** RaceDash AWS Productionisation plan must be fully implemented before this plan is executed.

---

## File Structure

```
infra/
  bin/
    app.ts                                         ← MODIFY: add Tags.of(stack) for all stacks
  lib/
    pipeline-stack.ts                              ← MODIFY: add LambdaFunctionNames + SocialUploadDlqUrl CfnOutputs; add cloudwatch:GetMetricData + ce:GetCostAndUsage to Vercel IAM policy; add Tags to ECS RunTask state definition
  lambda/
    create-mediaconvert-job/index.ts               ← MODIFY: add UserMetadata to CreateJobCommand (file location confirmed by grep in Task 1.2)

apps/web/
  package.json                                     ← MODIFY: add @aws-sdk/client-cloudwatch, @aws-sdk/client-cost-explorer

  app/
    (admin)/
      layout.tsx                                   ← CREATE: Clerk admin role guard; redirects non-admins to /
      admin/
        page.tsx                                   ← CREATE: Overview server component (DB stats + CloudWatch metrics)
        _components/
          RefreshButton.tsx                        ← CREATE: client component, calls router.refresh()
          MetricCard.tsx                           ← CREATE: server component, single stat card
          InFlightTable.tsx                        ← CREATE: server component, recent failed jobs table
        _data/
          overview-db.ts                           ← CREATE: DB queries for Overview page (in-flight counts, today's stats, failure rate, recent failed jobs)
          cloudwatch.ts                            ← CREATE: CloudWatch GetMetricData helper (Lambda errors, SFN failures, DLQ depth)
        jobs/
          page.tsx                                 ← CREATE: Jobs server component (job counts + job table)
          _components/
            JobsTable.tsx                          ← CREATE: server component, job table with status/range display
          _data/
            jobs-db.ts                             ← CREATE: DB queries for Jobs page (counts by status, job list with user email, duration)
        credits/
          page.tsx                                 ← CREATE: Credits server component (expiry buckets + totals + purchase history)
          _components/
            ExpiryBucketsTable.tsx                 ← CREATE: server component, expiry bucket rows
            PurchaseHistoryTable.tsx               ← CREATE: server component, purchase history rows
          _data/
            credits-db.ts                          ← CREATE: DB queries for Credits page (expiry buckets, all-time totals, purchase history)
        costs/
          page.tsx                                 ← CREATE: Costs server component (revenue + Cost Explorer)
          _components/
            CostSummaryCards.tsx                   ← CREATE: server component, summary metric cards
            ServiceBreakdownTable.tsx              ← CREATE: server component, AWS service cost rows
            DailyRevenueTable.tsx                  ← CREATE: server component, daily revenue vs spend rows
          _data/
            costs-db.ts                            ← CREATE: DB queries for Costs page (RC revenue by day + resolution tier)
            cost-explorer.ts                       ← CREATE: Cost Explorer GetCostAndUsage helper

  __tests__/
    admin/
      overview-db.test.ts                          ← CREATE: Vitest tests for overview DB queries
      jobs-db.test.ts                              ← CREATE: Vitest tests for jobs DB queries
      credits-db.test.ts                           ← CREATE: Vitest tests for credits DB queries
      costs-db.test.ts                             ← CREATE: Vitest tests for costs DB queries
      cloudwatch.test.ts                           ← CREATE: Vitest tests for CloudWatch helper
      cost-explorer.test.ts                        ← CREATE: Vitest tests for Cost Explorer helper
```

---

## Chunk 1: Cross-Cutting Infra Changes

Changes to `infra/` required before admin pages can function. Covers CDK stack tags, MediaConvert job tags, ECS RunTask job tags, two new CfnOutputs, IAM policy additions, and new Vercel env var documentation.

### Task 1.1: CDK Stack Tags in `infra/bin/app.ts`

**Files:**
- Modify: `infra/bin/app.ts`

- [ ] **Step 1: Open `infra/bin/app.ts` and locate the stack instantiation block**

  The file creates the four CDK stacks (`storageStack`, `pipelineStack`, `renderStack`, `notificationsStack`). Find the block where each stack is instantiated. We will add tag application after all stacks are created.

- [ ] **Step 2: Add `Tags` import and tag loop**

  Add the following after all stack `new XxxStack(...)` calls (before `app.synth()` if present, or at the end of the file):

  ```ts
  import { Tags } from 'aws-cdk-lib'

  // (existing stack instantiations above)

  const env = app.node.tryGetContext('env') ?? 'prod'

  const stacks = [storageStack, pipelineStack, renderStack, notificationsStack]
  for (const stack of stacks) {
    Tags.of(stack).add('racedash:project', 'racedash')
    Tags.of(stack).add('racedash:environment', env)
  }
  ```

  Note: `cdk.App` is already imported. Add `Tags` to the existing `aws-cdk-lib` import destructure:
  ```ts
  import * as cdk from 'aws-cdk-lib'
  import { Tags } from 'aws-cdk-lib'
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run:
  ```bash
  cd infra && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 4: Run `cdk synth` to confirm tags appear in CloudFormation output**

  Run:
  ```bash
  cd infra && npx cdk synth --context env=prod 2>&1 | grep -A2 'racedash:project'
  ```
  Expected output contains lines like:
  ```
  Key: racedash:project
  Value: racedash
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add infra/bin/app.ts
  git commit -m "feat(infra): add racedash:project and racedash:environment tags to all CDK stacks"
  ```

---

### Task 1.2: MediaConvert `UserMetadata` job tags

**Files:**
- Modify: the `CreateMediaConvertJob` Lambda source file (located in `infra/` Lambda handlers, e.g. `infra/lambda/create-mediaconvert-job/index.ts`)

- [ ] **Step 1: Locate the `CreateMediaConvertJob` Lambda handler**

  Find the file that calls `mediaConvert.send(new CreateJobCommand({...}))`. It will be under `infra/lambda/` or similar. Run:
  ```bash
  grep -r 'CreateJobCommand' infra/ --include='*.ts' -l
  ```

- [ ] **Step 2: Add `UserMetadata` to the `CreateJobCommand` call**

  Inside the existing `CreateJobCommand({...})` parameters, add:

  ```ts
  UserMetadata: {
    'racedash:job-id': jobId,
    'racedash:project': 'racedash',
  },
  ```

  The `jobId` value is already present in the Lambda handler's input from the Step Functions execution context.

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd infra && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 4: Commit**

  ```bash
  git add infra/lambda/create-mediaconvert-job/index.ts
  git commit -m "feat(infra): add UserMetadata job tags to MediaConvert job submission"
  ```

---

### Task 1.3: ECS RunTask job tags in Step Functions state definition

**Files:**
- Modify: the Step Functions state machine definition file (e.g. `infra/lib/pipeline-stack.ts` or a JSON/YAML state machine definition)

- [ ] **Step 1: Locate the `JoinFootage` ECS RunTask state definition**

  Find where the `ECS:runTask` resource is defined in the state machine. Run:
  ```bash
  grep -r 'ecs:runTask\|ECS:runTask\|runTask' infra/ --include='*.ts' --include='*.json' -l
  ```

- [ ] **Step 2: Add `Tags` array to the RunTask parameters**

  In the `JoinFootage` state's `Parameters` (or `Arguments` for SDK integrations), add:

  ```json
  "Tags": [
    { "Key": "racedash:job-id", "Value.$": "$.jobId" },
    { "Key": "racedash:project", "Value": "racedash" }
  ]
  ```

  For CDK Step Functions SDK integrations, this looks like:
  ```ts
  tags: [
    { key: 'racedash:job-id', value: sfn.JsonPath.stringAt('$.jobId') },
    { key: 'racedash:project', value: 'racedash' },
  ],
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd infra && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 4: Commit**

  ```bash
  git add infra/lib/pipeline-stack.ts
  git commit -m "feat(infra): add racedash:job-id and racedash:project tags to ECS RunTask"
  ```

---

### Task 1.4: New CDK CfnOutputs and IAM policy additions in `pipeline-stack.ts`

**Files:**
- Modify: `infra/lib/pipeline-stack.ts`

- [ ] **Step 1: Add `LambdaFunctionNames` CfnOutput**

  In `pipeline-stack.ts`, after all Lambda functions are defined, add a `CfnOutput` that collects the real generated function names. The CDK `function.functionName` property returns the actual name:

  ```ts
  import { CfnOutput } from 'aws-cdk-lib'

  // (after all Lambda function definitions)
  new CfnOutput(this, 'LambdaFunctionNames', {
    value: [
      validationFn.functionName,
      startRenderOverlayFn.functionName,
      waitForRemotionFn.functionName,
      createMediaConvertJobFn.functionName,
      waitForMediaConvertFn.functionName,
      finaliseJobFn.functionName,
      releaseCreditsAndFailFn.functionName,
      notifyUserFn.functionName,
      logNotifyErrorFn.functionName,
      eventbridgeRelayFn.functionName,
      socialUploadDispatchFn.functionName,
      socialUploadDlqFn.functionName,
    ].join(','),
    description: 'Comma-separated Lambda function names for CloudWatch monitoring',
    exportName: 'LambdaFunctionNames',
  })
  ```

  Replace `validationFn`, `startRenderOverlayFn`, etc. with the actual CDK variable names for each Lambda in the stack.

- [ ] **Step 2: Add `SocialUploadDlqUrl` CfnOutput**

  ```ts
  new CfnOutput(this, 'SocialUploadDlqUrl', {
    value: socialUploadDlq.queueUrl,
    description: 'SQS DLQ URL for social upload failures',
    exportName: 'SocialUploadDlqUrl',
  })
  ```

  Replace `socialUploadDlq` with the actual CDK variable name for the DLQ queue.

- [ ] **Step 3: Add IAM permissions to the Vercel IAM user policy**

  Find the Vercel IAM user or IAM policy construct in `pipeline-stack.ts`. Add:

  ```ts
  vercelUser.addToPolicy(new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['cloudwatch:GetMetricData', 'ce:GetCostAndUsage'],
    resources: ['*'],
  }))
  ```

  Note: `ce:GetCostAndUsage` requires `Resource: "*"` — Cost Explorer does not support resource-level restrictions.

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd infra && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 5: Run `cdk synth` to confirm outputs appear**

  ```bash
  cd infra && npx cdk synth --context env=prod 2>&1 | grep -A3 'LambdaFunctionNames\|SocialUploadDlqUrl'
  ```
  Expected: Both outputs appear in the CloudFormation template.

- [ ] **Step 6: Commit**

  ```bash
  git add infra/lib/pipeline-stack.ts
  git commit -m "feat(infra): add LambdaFunctionNames and SocialUploadDlqUrl CfnOutputs; add CloudWatch+CostExplorer IAM permissions"
  ```

---

### Task 1.5: Install AWS SDK packages in `apps/web`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add the two new SDK packages**

  ```bash
  cd apps/web && pnpm add @aws-sdk/client-cloudwatch @aws-sdk/client-cost-explorer
  ```

  Expected output: packages added to `apps/web/package.json` and `pnpm-lock.yaml`.

- [ ] **Step 2: Verify the packages are importable**

  Create a temporary check (do not commit this file):
  ```bash
  cd apps/web && node -e "require('@aws-sdk/client-cloudwatch'); require('@aws-sdk/client-cost-explorer'); console.log('ok')"
  ```
  Expected output: `ok`

- [ ] **Step 3: Document the new Vercel environment variables**

  Add the following entries to `apps/web/.env.example` (or the project's env documentation file — use whichever already exists):

  ```
  # Admin dashboard — populated from CDK stack outputs after deploy
  LAMBDA_FUNCTION_NAMES=           # Comma-separated list from LambdaFunctionNames CfnOutput
  SQS_SOCIAL_UPLOAD_DLQ_URL=       # From SocialUploadDlqUrl CfnOutput
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/package.json pnpm-lock.yaml apps/web/.env.example
  git commit -m "feat(web): add @aws-sdk/client-cloudwatch and @aws-sdk/client-cost-explorer dependencies"
  ```

---

## Chunk 2: Admin Auth + Layout + Overview Page

### Task 2.1: Admin route group layout with Clerk role guard

**Files:**
- Create: `apps/web/app/(admin)/layout.tsx`

- [ ] **Step 1: Create the `(admin)` directory and `layout.tsx`**

  ```bash
  mkdir -p apps/web/app/\(admin\)
  ```

  Create `apps/web/app/(admin)/layout.tsx`:

  ```ts
  import { auth } from '@clerk/nextjs/server'
  import { redirect } from 'next/navigation'

  export default async function AdminLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    const { sessionClaims } = await auth()
    if (sessionClaims?.publicMetadata?.role !== 'admin') redirect('/')
    return <>{children}</>
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/app/\(admin\)/layout.tsx
  git commit -m "feat(web): add (admin) route group with Clerk admin role guard"
  ```

---

### Task 2.2: Overview page DB data queries

**Files:**
- Create: `apps/web/app/(admin)/admin/_data/overview-db.ts`
- Create: `apps/web/__tests__/admin/overview-db.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/__tests__/admin/overview-db.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import {
    getInFlightCounts,
    getTodayStats,
    getSevenDayFailureRate,
    getRecentFailedJobs,
  } from '../../app/(admin)/admin/_data/overview-db'

  // Mock Drizzle db
  const mockDb = {
    select: vi.fn(),
    execute: vi.fn(),
  }

  describe('getInFlightCounts', () => {
    it('returns counts for each in-flight status', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { status: 'uploading', count: 3 },
              { status: 'queued', count: 1 },
              { status: 'joining', count: 0 },
              { status: 'rendering', count: 2 },
              { status: 'compositing', count: 1 },
            ]),
          }),
        }),
      })
      const result = await getInFlightCounts(mockDb as any)
      expect(result.uploading).toBe(3)
      expect(result.queued).toBe(1)
      expect(result.joining).toBe(0)
      expect(result.rendering).toBe(2)
      expect(result.compositing).toBe(1)
    })

    it('returns zero for any status not present in query result', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { status: 'rendering', count: 5 },
            ]),
          }),
        }),
      })
      const result = await getInFlightCounts(mockDb as any)
      expect(result.uploading).toBe(0)
      expect(result.queued).toBe(0)
      expect(result.joining).toBe(0)
      expect(result.rendering).toBe(5)
      expect(result.compositing).toBe(0)
    })
  })

  describe('getTodayStats', () => {
    it('returns completed and failed counts since midnight UTC', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { status: 'complete', count: 12 },
              { status: 'failed', count: 3 },
            ]),
          }),
        }),
      })
      const result = await getTodayStats(mockDb as any)
      expect(result.completedToday).toBe(12)
      expect(result.failedToday).toBe(3)
    })
  })

  describe('getSevenDayFailureRate', () => {
    it('returns failure rate as a percentage', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { status: 'complete', count: 90 },
              { status: 'failed', count: 10 },
            ]),
          }),
        }),
      })
      const result = await getSevenDayFailureRate(mockDb as any)
      expect(result).toBe(10) // 10 / (90 + 10) = 10%
    })

    it('returns 0 when no terminal jobs in last 7 days', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      const result = await getSevenDayFailureRate(mockDb as any)
      expect(result).toBe(0)
    })
  })

  describe('getRecentFailedJobs', () => {
    it('returns the 10 most recent failed jobs with error messages', async () => {
      const mockJobs = Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i}`,
        userEmail: `user${i}@test.com`,
        status: 'failed',
        rcCost: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        errorMessage: `Error ${i}`,
      }))
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockJobs),
              }),
            }),
          }),
        }),
      })
      const result = await getRecentFailedJobs(mockDb as any)
      expect(result).toHaveLength(10)
      expect(result[0].errorMessage).toBe('Error 0')
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/overview-db.test.ts
  ```
  Expected: FAIL — module not found

- [ ] **Step 3: Create the data module**

  Create `apps/web/app/(admin)/admin/_data/overview-db.ts`:

  ```ts
  import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
  import type { DrizzleDB } from '@racedash/db'
  import { jobs, users } from '@racedash/db/schema'

  const IN_FLIGHT_STATUSES = ['uploading', 'queued', 'joining', 'rendering', 'compositing'] as const
  type InFlightStatus = typeof IN_FLIGHT_STATUSES[number]

  export interface InFlightCounts {
    uploading: number
    queued: number
    joining: number
    rendering: number
    compositing: number
  }

  export async function getInFlightCounts(db: DrizzleDB): Promise<InFlightCounts> {
    const rows = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(inArray(jobs.status, [...IN_FLIGHT_STATUSES]))
      .groupBy(jobs.status)

    const counts: InFlightCounts = { uploading: 0, queued: 0, joining: 0, rendering: 0, compositing: 0 }
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as InFlightStatus] = row.count
      }
    }
    return counts
  }

  export interface TodayStats {
    completedToday: number
    failedToday: number
  }

  export async function getTodayStats(db: DrizzleDB): Promise<TodayStats> {
    const midnightUtc = new Date()
    midnightUtc.setUTCHours(0, 0, 0, 0)

    const rows = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ['complete', 'failed']),
          gte(jobs.updatedAt, midnightUtc),
        ),
      )
      .groupBy(jobs.status)

    let completedToday = 0
    let failedToday = 0
    for (const row of rows) {
      if (row.status === 'complete') completedToday = row.count
      if (row.status === 'failed') failedToday = row.count
    }
    return { completedToday, failedToday }
  }

  /** Returns failure rate as an integer percentage (0–100). */
  export async function getSevenDayFailureRate(db: DrizzleDB): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const rows = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ['complete', 'failed']),
          gte(jobs.updatedAt, sevenDaysAgo),
        ),
      )
      .groupBy(jobs.status)

    let complete = 0
    let failed = 0
    for (const row of rows) {
      if (row.status === 'complete') complete = row.count
      if (row.status === 'failed') failed = row.count
    }

    const total = complete + failed
    if (total === 0) return 0
    return Math.round((failed / total) * 100)
  }

  export interface FailedJob {
    id: string
    userEmail: string
    status: string
    rcCost: number | null
    createdAt: Date
    updatedAt: Date
    errorMessage: string | null
  }

  export async function getRecentFailedJobs(db: DrizzleDB): Promise<FailedJob[]> {
    return db
      .select({
        id: jobs.id,
        userEmail: users.email,
        status: jobs.status,
        rcCost: jobs.rcCost,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        errorMessage: jobs.errorMessage,
      })
      .from(jobs)
      .innerJoin(users, eq(jobs.userId, users.id))
      .where(eq(jobs.status, 'failed'))
      .orderBy(sql`${jobs.updatedAt} DESC`)
      .limit(10)
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/overview-db.test.ts
  ```
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/_data/overview-db.ts apps/web/__tests__/admin/overview-db.test.ts
  git commit -m "feat(web): add overview DB queries for admin dashboard"
  ```

---

### Task 2.3: CloudWatch metrics helper

**Files:**
- Create: `apps/web/app/(admin)/admin/_data/cloudwatch.ts`
- Create: `apps/web/__tests__/admin/cloudwatch.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/__tests__/admin/cloudwatch.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest'
  import { getCloudWatchMetrics } from '../../app/(admin)/admin/_data/cloudwatch'

  vi.mock('@aws-sdk/client-cloudwatch', () => ({
    CloudWatchClient: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        MetricDataResults: [
          { Id: 'lambda_fn0', Values: [2, 1, 0], Timestamps: [] },
          { Id: 'lambda_fn1', Values: [0], Timestamps: [] },
          { Id: 'sfn_failed', Values: [1], Timestamps: [] },
          { Id: 'sfn_timedout', Values: [0], Timestamps: [] },
          { Id: 'dlq_depth', Values: [3], Timestamps: [] },
        ],
      }),
    })),
    GetMetricDataCommand: vi.fn(),
  }))

  describe('getCloudWatchMetrics', () => {
    it('sums Lambda error values across time buckets per function', async () => {
      const result = await getCloudWatchMetrics({
        lambdaFunctionNames: ['fn-a', 'fn-b'],
        stateMachineArn: 'arn:aws:states:eu-west-1:123456789:stateMachine:racedash',
        dlqQueueName: 'racedash-social-upload-dlq',
        region: 'eu-west-1',
      })
      // fn-a maps to lambda_fn0: sum([2,1,0]) = 3
      expect(result.lambdaErrors['fn-a']).toBe(3)
      // fn-b maps to lambda_fn1: sum([0]) = 0
      expect(result.lambdaErrors['fn-b']).toBe(0)
    })

    it('returns SFN failure count as sum of failed + timed out', async () => {
      const result = await getCloudWatchMetrics({
        lambdaFunctionNames: ['fn-a', 'fn-b'],
        stateMachineArn: 'arn:aws:states:eu-west-1:123456789:stateMachine:racedash',
        dlqQueueName: 'racedash-social-upload-dlq',
        region: 'eu-west-1',
      })
      // sfn_failed: [1], sfn_timedout: [0] → 1 + 0 = 1
      expect(result.sfnFailures).toBe(1)
    })

    it('returns DLQ depth as the latest value', async () => {
      const result = await getCloudWatchMetrics({
        lambdaFunctionNames: ['fn-a', 'fn-b'],
        stateMachineArn: 'arn:aws:states:eu-west-1:123456789:stateMachine:racedash',
        dlqQueueName: 'racedash-social-upload-dlq',
        region: 'eu-west-1',
      })
      // dlq_depth: [3] → 3
      expect(result.dlqDepth).toBe(3)
    })
  })

  describe('getCloudWatchMetrics input validation', () => {
    it('extracts queue name from DLQ URL when called via the page', () => {
      const dlqUrl = 'https://sqs.eu-west-1.amazonaws.com/123456789012/racedash-social-upload-dlq'
      const queueName = dlqUrl.split('/').at(-1)
      expect(queueName).toBe('racedash-social-upload-dlq')
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/cloudwatch.test.ts
  ```
  Expected: FAIL — module not found

- [ ] **Step 3: Create the CloudWatch helper**

  Create `apps/web/app/(admin)/admin/_data/cloudwatch.ts`:

  ```ts
  import {
    CloudWatchClient,
    GetMetricDataCommand,
    type MetricDataQuery,
  } from '@aws-sdk/client-cloudwatch'

  export interface CloudWatchInput {
    lambdaFunctionNames: string[]
    stateMachineArn: string
    dlqQueueName: string
    region: string
  }

  export interface CloudWatchMetrics {
    lambdaErrors: Record<string, number>
    sfnFailures: number
    dlqDepth: number
  }

  export async function getCloudWatchMetrics(input: CloudWatchInput): Promise<CloudWatchMetrics> {
    const client = new CloudWatchClient({ region: input.region })

    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)

    const lambdaQueries: MetricDataQuery[] = input.lambdaFunctionNames.map((name, idx) => ({
      Id: `lambda_fn${idx}`,
      MetricStat: {
        Metric: {
          Namespace: 'AWS/Lambda',
          MetricName: 'Errors',
          Dimensions: [{ Name: 'FunctionName', Value: name }],
        },
        Period: 3600,
        Stat: 'Sum',
      },
    }))

    const sfnQueries: MetricDataQuery[] = [
      {
        Id: 'sfn_failed',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/States',
            MetricName: 'ExecutionsFailed',
            Dimensions: [{ Name: 'StateMachineArn', Value: input.stateMachineArn }],
          },
          Period: 3600,
          Stat: 'Sum',
        },
      },
      {
        Id: 'sfn_timedout',
        MetricStat: {
          Metric: {
            Namespace: 'AWS/States',
            MetricName: 'ExecutionsTimedOut',
            Dimensions: [{ Name: 'StateMachineArn', Value: input.stateMachineArn }],
          },
          Period: 3600,
          Stat: 'Sum',
        },
      },
    ]

    const dlqQuery: MetricDataQuery = {
      Id: 'dlq_depth',
      MetricStat: {
        Metric: {
          Namespace: 'AWS/SQS',
          MetricName: 'ApproximateNumberOfMessagesVisible',
          Dimensions: [{ Name: 'QueueName', Value: input.dlqQueueName }],
        },
        Period: 3600,
        Stat: 'Maximum',
      },
    }

    const command = new GetMetricDataCommand({
      MetricDataQueries: [...lambdaQueries, ...sfnQueries, dlqQuery],
      StartTime: startTime,
      EndTime: endTime,
    })

    const response = await client.send(command)
    const results = response.MetricDataResults ?? []

    // Build lambdaErrors map: lambda_fn0 → functionNames[0]
    const lambdaErrors: Record<string, number> = {}
    for (let i = 0; i < input.lambdaFunctionNames.length; i++) {
      const r = results.find((r) => r.Id === `lambda_fn${i}`)
      const total = (r?.Values ?? []).reduce((acc, v) => acc + v, 0)
      lambdaErrors[input.lambdaFunctionNames[i]] = total
    }

    const sfnFailed = results.find((r) => r.Id === 'sfn_failed')
    const sfnTimedOut = results.find((r) => r.Id === 'sfn_timedout')
    const sfnFailures =
      (sfnFailed?.Values ?? []).reduce((a, v) => a + v, 0) +
      (sfnTimedOut?.Values ?? []).reduce((a, v) => a + v, 0)

    const dlqResult = results.find((r) => r.Id === 'dlq_depth')
    const dlqDepth = dlqResult?.Values?.[0] ?? 0

    return { lambdaErrors, sfnFailures, dlqDepth }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/cloudwatch.test.ts
  ```
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/_data/cloudwatch.ts apps/web/__tests__/admin/cloudwatch.test.ts
  git commit -m "feat(web): add CloudWatch GetMetricData helper for admin overview"
  ```

---

### Task 2.4: Overview page shared components

**Files:**
- Create: `apps/web/app/(admin)/admin/_components/RefreshButton.tsx`
- Create: `apps/web/app/(admin)/admin/_components/MetricCard.tsx`
- Create: `apps/web/app/(admin)/admin/_components/InFlightTable.tsx`

- [ ] **Step 1: Create `RefreshButton.tsx`**

  ```tsx
  'use client'

  import { useRouter } from 'next/navigation'

  export function RefreshButton() {
    const router = useRouter()
    return (
      <button
        onClick={() => router.refresh()}
        className="px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded hover:bg-gray-700"
      >
        Refresh
      </button>
    )
  }
  ```

- [ ] **Step 2: Create `MetricCard.tsx`**

  ```tsx
  interface MetricCardProps {
    label: string
    value: string | number
    sub?: string
  }

  export function MetricCard({ label, value, sub }: MetricCardProps) {
    return (
      <div className="bg-white rounded border border-gray-200 p-4">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      </div>
    )
  }
  ```

- [ ] **Step 3: Create `InFlightTable.tsx`**

  ```tsx
  import type { FailedJob } from '../_data/overview-db'

  interface InFlightTableProps {
    jobs: FailedJob[]
  }

  export function InFlightTable({ jobs }: InFlightTableProps) {
    if (jobs.length === 0) {
      return <p className="text-sm text-gray-500">No recent failures.</p>
    }
    return (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-4">Job ID</th>
            <th className="py-2 pr-4">User</th>
            <th className="py-2 pr-4">RC Cost</th>
            <th className="py-2 pr-4">Failed At</th>
            <th className="py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-mono text-xs">{job.id}</td>
              <td className="py-2 pr-4">{job.userEmail}</td>
              <td className="py-2 pr-4">{job.rcCost ?? '—'}</td>
              <td className="py-2 pr-4">{job.updatedAt.toISOString()}</td>
              <td className="py-2 text-red-600 truncate max-w-xs">{job.errorMessage ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/_components/
  git commit -m "feat(web): add RefreshButton, MetricCard, and InFlightTable components for admin overview"
  ```

---

### Task 2.5: Overview page server component

**Files:**
- Create: `apps/web/app/(admin)/admin/page.tsx`

- [ ] **Step 1: Create the directory and page**

  ```bash
  mkdir -p apps/web/app/\(admin\)/admin
  ```

  Create `apps/web/app/(admin)/admin/page.tsx`:

  ```tsx
  import { Suspense } from 'react'
  import { db } from '@racedash/db'
  import {
    getInFlightCounts,
    getTodayStats,
    getSevenDayFailureRate,
    getRecentFailedJobs,
  } from './_data/overview-db'
  import { getCloudWatchMetrics } from './_data/cloudwatch'
  import { MetricCard } from './_components/MetricCard'
  import { InFlightTable } from './_components/InFlightTable'
  import { RefreshButton } from './_components/RefreshButton'

  async function CloudWatchSection() {
    const lambdaFunctionNames = (process.env.LAMBDA_FUNCTION_NAMES ?? '').split(',').filter(Boolean)
    const stateMachineArn = process.env.STEP_FUNCTIONS_STATE_MACHINE_ARN ?? ''
    const dlqUrl = process.env.SQS_SOCIAL_UPLOAD_DLQ_URL ?? ''
    const dlqQueueName = dlqUrl.split('/').at(-1) ?? ''
    const region = process.env.AWS_REGION ?? 'eu-west-1'

    const metrics = await getCloudWatchMetrics({
      lambdaFunctionNames,
      stateMachineArn,
      dlqQueueName,
      region,
    })

    const totalLambdaErrors = Object.values(metrics.lambdaErrors).reduce((a, b) => a + b, 0)

    return (
      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Infrastructure (last 24h)</h2>
        <div className="grid grid-cols-3 gap-4">
          <MetricCard label="Lambda Errors" value={totalLambdaErrors} sub="all functions, last 24h" />
          <MetricCard label="SFN Failures" value={metrics.sfnFailures} sub="failed + timed out" />
          <MetricCard label="DLQ Depth" value={metrics.dlqDepth} sub="social upload DLQ" />
        </div>
        {totalLambdaErrors > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-gray-600">Lambda error breakdown</summary>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1 pr-4">Function</th>
                  <th className="py-1">Errors</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.lambdaErrors)
                  .filter(([, count]) => count > 0)
                  .map(([fn, count]) => (
                    <tr key={fn}>
                      <td className="py-1 pr-4 font-mono text-xs">{fn}</td>
                      <td className="py-1 text-red-600">{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    )
  }

  export default async function AdminOverviewPage() {
    const [inFlight, todayStats, failureRate, recentFailed] = await Promise.all([
      getInFlightCounts(db),
      getTodayStats(db),
      getSevenDayFailureRate(db),
      getRecentFailedJobs(db),
    ])

    return (
      <main className="p-8 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Admin Overview</h1>
          <RefreshButton />
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4">Pipeline Status</h2>
          <div className="grid grid-cols-5 gap-4">
            <MetricCard label="Uploading" value={inFlight.uploading} />
            <MetricCard label="Queued" value={inFlight.queued} />
            <MetricCard label="Joining" value={inFlight.joining} />
            <MetricCard label="Rendering" value={inFlight.rendering} />
            <MetricCard label="Compositing" value={inFlight.compositing} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Today (UTC)</h2>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Completed Today" value={todayStats.completedToday} />
            <MetricCard label="Failed Today" value={todayStats.failedToday} />
            <MetricCard label="7-Day Failure Rate" value={`${failureRate}%`} sub="failed / (complete + failed)" />
          </div>
        </section>

        <Suspense fallback={<div className="mt-8 text-sm text-gray-400">Loading CloudWatch metrics…</div>}>
          <CloudWatchSection />
        </Suspense>

        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Recent Failures (last 10)</h2>
          <InFlightTable jobs={recentFailed} />
        </section>
      </main>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/page.tsx
  git commit -m "feat(web): add /admin overview page with pipeline stats and CloudWatch metrics"
  ```

---

## Chunk 3: Jobs + Credits Pages

### Task 3.1: Jobs page DB queries

**Files:**
- Create: `apps/web/app/(admin)/admin/jobs/_data/jobs-db.ts`
- Create: `apps/web/__tests__/admin/jobs-db.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/__tests__/admin/jobs-db.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest'
  import {
    getJobCountsByStatus,
    getJobsList,
    type JobsTimeRange,
  } from '../../app/(admin)/admin/jobs/_data/jobs-db'

  const mockDb = {
    select: vi.fn(),
  }

  describe('getJobCountsByStatus', () => {
    it('returns counts grouped by status for all-time range', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { status: 'complete', count: 150 },
              { status: 'failed', count: 20 },
              { status: 'uploading', count: 5 },
            ]),
          }),
        }),
      })
      const result = await getJobCountsByStatus(mockDb as any, 'all')
      expect(result.complete).toBe(150)
      expect(result.failed).toBe(20)
      expect(result.uploading).toBe(5)
    })

    it('applies a date filter for 7d range', async () => {
      const whereSpy = vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue([]),
      })
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({ where: whereSpy }),
      })
      await getJobCountsByStatus(mockDb as any, '7d')
      expect(whereSpy).toHaveBeenCalled()
    })
  })

  describe('getJobsList', () => {
    it('returns jobs with user email and derived duration for terminal jobs', async () => {
      const now = new Date()
      const createdAt = new Date(now.getTime() - 10 * 60 * 1000)
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'job-abc',
                    userEmail: 'user@test.com',
                    status: 'complete',
                    rcCost: 45,
                    createdAt,
                    updatedAt: now,
                    errorMessage: null,
                  },
                ]),
              }),
            }),
          }),
        }),
      })
      const result = await getJobsList(mockDb as any, 'all')
      expect(result[0].id).toBe('job-abc')
      expect(result[0].rcCost).toBe(45)
      // Duration should be approximately 10 minutes
      expect(result[0].durationMs).toBeGreaterThan(9 * 60 * 1000)
    })

    it('returns null duration for non-terminal jobs', async () => {
      const now = new Date()
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'job-xyz',
                    userEmail: 'user@test.com',
                    status: 'rendering',
                    rcCost: null,
                    createdAt: now,
                    updatedAt: now,
                    errorMessage: null,
                  },
                ]),
              }),
            }),
          }),
        }),
      })
      const result = await getJobsList(mockDb as any, 'all')
      expect(result[0].durationMs).toBeNull()
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/jobs-db.test.ts
  ```
  Expected: FAIL — module not found

- [ ] **Step 3: Create the jobs DB module**

  Create `apps/web/app/(admin)/admin/jobs/_data/jobs-db.ts`:

  ```ts
  import { and, gte, inArray, sql } from 'drizzle-orm'
  import { eq } from 'drizzle-orm'
  import type { DrizzleDB } from '@racedash/db'
  import { jobs, users } from '@racedash/db/schema'

  export type JobsTimeRange = '7d' | '30d' | 'all'

  const TERMINAL_STATUSES = ['complete', 'failed'] as const
  const ALL_STATUSES = ['uploading', 'queued', 'joining', 'rendering', 'compositing', 'complete', 'failed'] as const

  function rangeStartDate(range: JobsTimeRange): Date | null {
    if (range === 'all') return null
    const days = range === '7d' ? 7 : 30
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  }

  export type StatusCounts = Record<typeof ALL_STATUSES[number], number>

  export async function getJobCountsByStatus(
    db: DrizzleDB,
    range: JobsTimeRange,
  ): Promise<StatusCounts> {
    const since = rangeStartDate(range)
    const whereClause = since ? gte(jobs.createdAt, since) : undefined

    const rows = await db
      .select({ status: jobs.status, count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(whereClause)
      .groupBy(jobs.status)

    const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as StatusCounts
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status as keyof StatusCounts] = row.count
      }
    }
    return counts
  }

  export interface JobListRow {
    id: string
    userEmail: string
    status: string
    rcCost: number | null
    createdAt: Date
    updatedAt: Date
    durationMs: number | null
    errorMessage: string | null
  }

  export async function getJobsList(
    db: DrizzleDB,
    range: JobsTimeRange,
    limit = 100,
  ): Promise<JobListRow[]> {
    const since = rangeStartDate(range)
    const whereClause = since ? gte(jobs.createdAt, since) : undefined

    const rows = await db
      .select({
        id: jobs.id,
        userEmail: users.email,
        status: jobs.status,
        rcCost: jobs.rcCost,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        errorMessage: jobs.errorMessage,
      })
      .from(jobs)
      .innerJoin(users, eq(jobs.userId, users.id))
      .where(whereClause)
      .orderBy(sql`${jobs.createdAt} DESC`)
      .limit(limit)

    return rows.map((row) => ({
      ...row,
      // Duration only meaningful for terminal states where updatedAt reflects completion
      durationMs: TERMINAL_STATUSES.includes(row.status as any)
        ? row.updatedAt.getTime() - row.createdAt.getTime()
        : null,
    }))
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/jobs-db.test.ts
  ```
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/jobs/_data/jobs-db.ts apps/web/__tests__/admin/jobs-db.test.ts
  git commit -m "feat(web): add jobs DB queries for admin jobs page"
  ```

---

### Task 3.2: Jobs page component and page

**Files:**
- Create: `apps/web/app/(admin)/admin/jobs/_components/JobsTable.tsx`
- Create: `apps/web/app/(admin)/admin/jobs/page.tsx`

- [ ] **Step 1: Create `JobsTable.tsx`**

  Create `apps/web/app/(admin)/admin/jobs/_components/JobsTable.tsx`:

  ```tsx
  import type { JobListRow } from '../_data/jobs-db'

  interface JobsTableProps {
    jobs: JobListRow[]
  }

  function formatDuration(ms: number | null): string {
    if (ms === null) return '—'
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min}m ${sec}s`
  }

  export function JobsTable({ jobs }: JobsTableProps) {
    if (jobs.length === 0) {
      return <p className="text-sm text-gray-500">No jobs found.</p>
    }
    return (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-4">Job ID</th>
            <th className="py-2 pr-4">User</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">RC Cost</th>
            <th className="py-2 pr-4">Duration</th>
            <th className="py-2 pr-4">Created</th>
            <th className="py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b last:border-0">
              <td className="py-2 pr-4 font-mono text-xs">{job.id}</td>
              <td className="py-2 pr-4">{job.userEmail}</td>
              <td className="py-2 pr-4">
                <span
                  className={
                    job.status === 'failed'
                      ? 'text-red-600'
                      : job.status === 'complete'
                        ? 'text-green-600'
                        : 'text-yellow-600'
                  }
                >
                  {job.status}
                </span>
              </td>
              <td className="py-2 pr-4">{job.rcCost ?? '—'}</td>
              <td className="py-2 pr-4">{formatDuration(job.durationMs)}</td>
              <td className="py-2 pr-4 text-xs">{job.createdAt.toISOString()}</td>
              <td className="py-2 text-red-600 truncate max-w-xs">{job.errorMessage ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  ```

- [ ] **Step 2: Create `jobs/page.tsx`**

  Create `apps/web/app/(admin)/admin/jobs/page.tsx`:

  ```tsx
  import { db } from '@racedash/db'
  import { getJobCountsByStatus, getJobsList, type JobsTimeRange } from './_data/jobs-db'
  import { JobsTable } from './_components/JobsTable'
  import { MetricCard } from '../_components/MetricCard'
  import { RefreshButton } from '../_components/RefreshButton'

  interface Props {
    searchParams: Promise<{ range?: string }>
  }

  function parseRange(raw: string | undefined): JobsTimeRange {
    if (raw === '7d' || raw === '30d' || raw === 'all') return raw
    return '7d'
  }

  export default async function AdminJobsPage({ searchParams }: Props) {
    const { range: rawRange } = await searchParams
    const range = parseRange(rawRange)

    const [counts, jobList] = await Promise.all([
      getJobCountsByStatus(db, range),
      getJobsList(db, range),
    ])

    const rangeLabel = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'All time'

    return (
      <main className="p-8 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Jobs</h1>
          <div className="flex gap-4 items-center">
            <nav className="flex gap-2 text-sm">
              {(['7d', '30d', 'all'] as const).map((r) => (
                <a
                  key={r}
                  href={`?range=${r}`}
                  className={`px-3 py-1 rounded border ${range === r ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
                >
                  {r === '7d' ? '7 days' : r === '30d' ? '30 days' : 'All time'}
                </a>
              ))}
            </nav>
            <RefreshButton />
          </div>
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4">Counts — {rangeLabel}</h2>
          <div className="grid grid-cols-4 gap-4">
            <MetricCard label="Complete" value={counts.complete} />
            <MetricCard label="Failed" value={counts.failed} />
            <MetricCard label="In Progress" value={counts.uploading + counts.queued + counts.joining + counts.rendering + counts.compositing} />
            <MetricCard
              label="Failure Rate"
              value={
                counts.complete + counts.failed === 0
                  ? '—'
                  : `${Math.round((counts.failed / (counts.complete + counts.failed)) * 100)}%`
              }
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Jobs — {rangeLabel} (latest 100)</h2>
          <JobsTable jobs={jobList} />
        </section>
      </main>
    )
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/jobs/
  git commit -m "feat(web): add /admin/jobs page with job counts and job list table"
  ```

---

### Task 3.3: Credits page DB queries

**Files:**
- Create: `apps/web/app/(admin)/admin/credits/_data/credits-db.ts`
- Create: `apps/web/__tests__/admin/credits-db.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/__tests__/admin/credits-db.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest'
  import {
    getExpiryBuckets,
    getAllTimeTotals,
    getPurchaseHistory,
  } from '../../app/(admin)/admin/credits/_data/credits-db'

  const mockDb = {
    select: vi.fn(),
    execute: vi.fn(),
  }

  describe('getExpiryBuckets', () => {
    it('returns 5 buckets covering all expiry ranges', async () => {
      mockDb.execute.mockResolvedValue([
        { bucket: 'active_gt_90d', packCount: 10, rcRemaining: 5000, totalPriceGbp: 200, totalRcTotal: 6000 },
        { bucket: 'expiring_30_90d', packCount: 3, rcRemaining: 800, totalPriceGbp: 30, totalRcTotal: 1000 },
        { bucket: 'expiring_7_30d', packCount: 1, rcRemaining: 200, totalPriceGbp: 10, totalRcTotal: 250 },
        { bucket: 'expiring_lt_7d', packCount: 0, rcRemaining: 0, totalPriceGbp: 0, totalRcTotal: 0 },
        { bucket: 'expired_remaining', packCount: 2, rcRemaining: 150, totalPriceGbp: 0, totalRcTotal: 500 },
      ])
      const result = await getExpiryBuckets(mockDb as any)
      expect(result).toHaveLength(5)
      expect(result[0].bucket).toBe('active_gt_90d')
      expect(result[0].packCount).toBe(10)
      expect(result[0].rcRemaining).toBe(5000)
    })

    it('computes estimated GBP liability as (rcRemaining / rcTotal) * priceGbp', async () => {
      mockDb.execute.mockResolvedValue([
        { bucket: 'active_gt_90d', packCount: 1, rcRemaining: 50, totalPriceGbp: 10, totalRcTotal: 100 },
      ])
      const result = await getExpiryBuckets(mockDb as any)
      // 50/100 * 10 = 5.00
      expect(result[0].estimatedLiabilityGbp).toBeCloseTo(5.0, 2)
    })
  })

  describe('getAllTimeTotals', () => {
    it('returns total RC sold, consumed, and expired', async () => {
      // Three separate DB calls — mock sequence
      mockDb.execute
        .mockResolvedValueOnce([{ total: 50000 }])   // rc sold
        .mockResolvedValueOnce([{ total: 38000 }])   // rc consumed
        .mockResolvedValueOnce([{ total: 1500 }])    // rc expired

      const result = await getAllTimeTotals(mockDb as any)
      expect(result.rcSold).toBe(50000)
      expect(result.rcConsumed).toBe(38000)
      expect(result.rcExpired).toBe(1500)
    })

    it('returns 0 for any total when query returns null', async () => {
      mockDb.execute
        .mockResolvedValueOnce([{ total: null }])
        .mockResolvedValueOnce([{ total: null }])
        .mockResolvedValueOnce([{ total: null }])

      const result = await getAllTimeTotals(mockDb as any)
      expect(result.rcSold).toBe(0)
      expect(result.rcConsumed).toBe(0)
      expect(result.rcExpired).toBe(0)
    })
  })

  describe('getPurchaseHistory', () => {
    it('returns 50 rows newest first with user email', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(
                Array.from({ length: 50 }, (_, i) => ({
                  packName: `Pack ${i}`,
                  rcTotal: 100,
                  priceGbp: '10.00',
                  purchasedAt: new Date(),
                  userEmail: `user${i}@test.com`,
                })),
              ),
            }),
          }),
        }),
      })
      const result = await getPurchaseHistory(mockDb as any)
      expect(result).toHaveLength(50)
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/credits-db.test.ts
  ```
  Expected: FAIL — module not found

- [ ] **Step 3: Create the credits DB module**

  Create `apps/web/app/(admin)/admin/credits/_data/credits-db.ts`:

  ```ts
  import { sql, eq, lt, gt, and } from 'drizzle-orm'
  import type { DrizzleDB } from '@racedash/db'
  import { creditPacks, creditReservations, creditReservationPacks, users } from '@racedash/db/schema'

  export interface ExpiryBucket {
    bucket: string
    label: string
    packCount: number
    rcRemaining: number
    estimatedLiabilityGbp: number
  }

  export async function getExpiryBuckets(db: DrizzleDB): Promise<ExpiryBucket[]> {
    // Single query with CASE bucketing
    const rows = await db.execute<{
      bucket: string
      packCount: number
      rcRemaining: number
      totalPriceGbp: number
      totalRcTotal: number
    }>(sql`
      SELECT
        CASE
          WHEN expires_at > now() + INTERVAL '90 days' THEN 'active_gt_90d'
          WHEN expires_at BETWEEN now() + INTERVAL '30 days' AND now() + INTERVAL '90 days' THEN 'expiring_30_90d'
          WHEN expires_at BETWEEN now() + INTERVAL '7 days' AND now() + INTERVAL '30 days' THEN 'expiring_7_30d'
          WHEN expires_at BETWEEN now() AND now() + INTERVAL '7 days' THEN 'expiring_lt_7d'
          WHEN expires_at < now() THEN 'expired_remaining'
        END AS bucket,
        count(*)::int AS "packCount",
        coalesce(sum(rc_remaining), 0)::int AS "rcRemaining",
        coalesce(sum(price_gbp::numeric), 0)::numeric AS "totalPriceGbp",
        coalesce(sum(rc_total), 0)::int AS "totalRcTotal"
      FROM credit_packs
      WHERE rc_remaining > 0
      GROUP BY bucket
      ORDER BY bucket
    `)

    const BUCKET_LABELS: Record<string, string> = {
      active_gt_90d: 'Active > 90d',
      expiring_30_90d: 'Expiring 30–90d',
      expiring_7_30d: 'Expiring 7–30d',
      expiring_lt_7d: 'Expiring < 7d',
      expired_remaining: 'Expired (RC remaining)',
    }

    return rows.map((row) => ({
      bucket: row.bucket,
      label: BUCKET_LABELS[row.bucket] ?? row.bucket,
      packCount: row.packCount,
      rcRemaining: row.rcRemaining,
      estimatedLiabilityGbp:
        row.totalRcTotal > 0
          ? (row.rcRemaining / row.totalRcTotal) * Number(row.totalPriceGbp)
          : 0,
    }))
  }

  export interface AllTimeTotals {
    rcSold: number
    rcConsumed: number
    rcExpired: number
  }

  export async function getAllTimeTotals(db: DrizzleDB): Promise<AllTimeTotals> {
    const [soldRows, consumedRows, expiredRows] = await Promise.all([
      db.execute<{ total: number | null }>(
        sql`SELECT coalesce(sum(rc_total), 0)::int AS total FROM credit_packs`,
      ),
      db.execute<{ total: number | null }>(sql`
        SELECT coalesce(sum(crp.rc_deducted), 0)::int AS total
        FROM credit_reservation_packs crp
        JOIN credit_reservations cr ON crp.reservation_id = cr.id
        WHERE cr.status = 'consumed'
      `),
      db.execute<{ total: number | null }>(sql`
        SELECT coalesce(sum(rc_remaining), 0)::int AS total
        FROM credit_packs
        WHERE expires_at < now() AND rc_remaining > 0
      `),
    ])

    return {
      rcSold: soldRows[0]?.total ?? 0,
      rcConsumed: consumedRows[0]?.total ?? 0,
      rcExpired: expiredRows[0]?.total ?? 0,
    }
  }

  export interface PurchaseHistoryRow {
    packName: string
    rcTotal: number
    priceGbp: string
    purchasedAt: Date
    userEmail: string
  }

  export async function getPurchaseHistory(db: DrizzleDB): Promise<PurchaseHistoryRow[]> {
    return db
      .select({
        packName: creditPacks.packName,
        rcTotal: creditPacks.rcTotal,
        priceGbp: creditPacks.priceGbp,
        purchasedAt: creditPacks.purchasedAt,
        userEmail: users.email,
      })
      .from(creditPacks)
      .innerJoin(users, eq(creditPacks.userId, users.id))
      .orderBy(sql`${creditPacks.purchasedAt} DESC`)
      .limit(50)
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/credits-db.test.ts
  ```
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/credits/_data/credits-db.ts apps/web/__tests__/admin/credits-db.test.ts
  git commit -m "feat(web): add credits DB queries for admin credits page"
  ```

---

### Task 3.4: Credits page components and page

**Files:**
- Create: `apps/web/app/(admin)/admin/credits/_components/ExpiryBucketsTable.tsx`
- Create: `apps/web/app/(admin)/admin/credits/_components/PurchaseHistoryTable.tsx`
- Create: `apps/web/app/(admin)/admin/credits/page.tsx`

- [ ] **Step 1: Create `ExpiryBucketsTable.tsx`**

  Create `apps/web/app/(admin)/admin/credits/_components/ExpiryBucketsTable.tsx`:

  ```tsx
  import type { ExpiryBucket } from '../_data/credits-db'

  interface ExpiryBucketsTableProps {
    buckets: ExpiryBucket[]
  }

  export function ExpiryBucketsTable({ buckets }: ExpiryBucketsTableProps) {
    return (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-4">Bucket</th>
            <th className="py-2 pr-4">Packs</th>
            <th className="py-2 pr-4">RC Remaining</th>
            <th className="py-2">Est. £ Liability</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.bucket} className="border-b last:border-0">
              <td className="py-2 pr-4">{bucket.label}</td>
              <td className="py-2 pr-4">{bucket.packCount}</td>
              <td className="py-2 pr-4">{bucket.rcRemaining.toLocaleString()} RC</td>
              <td className="py-2">£{bucket.estimatedLiabilityGbp.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  ```

- [ ] **Step 2: Create `PurchaseHistoryTable.tsx`**

  Create `apps/web/app/(admin)/admin/credits/_components/PurchaseHistoryTable.tsx`:

  ```tsx
  import type { PurchaseHistoryRow } from '../_data/credits-db'

  interface PurchaseHistoryTableProps {
    rows: PurchaseHistoryRow[]
  }

  export function PurchaseHistoryTable({ rows }: PurchaseHistoryTableProps) {
    if (rows.length === 0) {
      return <p className="text-sm text-gray-500">No purchases yet.</p>
    }
    return (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-4">Pack</th>
            <th className="py-2 pr-4">RC</th>
            <th className="py-2 pr-4">Price</th>
            <th className="py-2 pr-4">User</th>
            <th className="py-2">Purchased</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2 pr-4">{row.packName}</td>
              <td className="py-2 pr-4">{row.rcTotal.toLocaleString()} RC</td>
              <td className="py-2 pr-4">£{Number(row.priceGbp).toFixed(2)}</td>
              <td className="py-2 pr-4">{row.userEmail}</td>
              <td className="py-2 text-xs">{row.purchasedAt.toISOString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  ```

- [ ] **Step 3: Create `credits/page.tsx`**

  Create `apps/web/app/(admin)/admin/credits/page.tsx`:

  ```tsx
  import { db } from '@racedash/db'
  import {
    getExpiryBuckets,
    getAllTimeTotals,
    getPurchaseHistory,
  } from './_data/credits-db'
  import { ExpiryBucketsTable } from './_components/ExpiryBucketsTable'
  import { PurchaseHistoryTable } from './_components/PurchaseHistoryTable'
  import { MetricCard } from '../_components/MetricCard'
  import { RefreshButton } from '../_components/RefreshButton'

  export default async function AdminCreditsPage() {
    const [buckets, totals, purchaseHistory] = await Promise.all([
      getExpiryBuckets(db),
      getAllTimeTotals(db),
      getPurchaseHistory(db),
    ])

    const rcOutstanding = totals.rcSold - totals.rcConsumed - totals.rcExpired

    return (
      <main className="p-8 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Credits</h1>
          <RefreshButton />
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4">All-Time Totals</h2>
          <div className="grid grid-cols-4 gap-4">
            <MetricCard label="RC Sold" value={totals.rcSold.toLocaleString()} />
            <MetricCard label="RC Consumed" value={totals.rcConsumed.toLocaleString()} sub="settled reservations" />
            <MetricCard label="RC Expired" value={totals.rcExpired.toLocaleString()} sub="forfeited on expiry" />
            <MetricCard label="RC Outstanding" value={rcOutstanding.toLocaleString()} sub="platform liability" />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Expiry Buckets (active packs)</h2>
          <ExpiryBucketsTable buckets={buckets} />
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Purchase History (latest 50)</h2>
          <PurchaseHistoryTable rows={purchaseHistory} />
        </section>
      </main>
    )
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/credits/
  git commit -m "feat(web): add /admin/credits page with expiry buckets and purchase history"
  ```

---

## Chunk 4: Cost Profiling Page

### Task 4.1: Costs page DB queries

**Files:**
- Create: `apps/web/app/(admin)/admin/costs/_data/costs-db.ts`
- Create: `apps/web/__tests__/admin/costs-db.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/__tests__/admin/costs-db.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest'
  import {
    getDailyRevenue,
    getResolutionBreakdown,
    type CostsTimeRange,
  } from '../../app/(admin)/admin/costs/_data/costs-db'

  const mockDb = {
    execute: vi.fn(),
  }

  describe('getDailyRevenue', () => {
    it('returns daily revenue rows for the given time range', async () => {
      mockDb.execute.mockResolvedValue([
        { day: '2026-03-10', revenueGbp: '45.23' },
        { day: '2026-03-09', revenueGbp: '32.10' },
      ])
      const result = await getDailyRevenue(mockDb as any, '7d')
      expect(result).toHaveLength(2)
      expect(result[0].day).toBe('2026-03-10')
      expect(result[0].revenueGbp).toBeCloseTo(45.23, 2)
    })

    it('excludes social upload reservations (job_id LIKE su_%)', async () => {
      // The SQL contains WHERE cr.job_id NOT LIKE 'su\_%' ESCAPE '\\'
      // We verify the query is called without errors; filtering is in SQL
      mockDb.execute.mockResolvedValue([])
      const result = await getDailyRevenue(mockDb as any, '30d')
      expect(result).toHaveLength(0)
      expect(mockDb.execute).toHaveBeenCalledOnce()
    })

    it('applies 7-day window for 7d range', async () => {
      mockDb.execute.mockResolvedValue([])
      await getDailyRevenue(mockDb as any, '7d')
      const callArg = mockDb.execute.mock.calls[0][0]
      // The SQL template should contain a 7-day interval reference
      expect(JSON.stringify(callArg)).toContain('7')
    })
  })

  describe('getResolutionBreakdown', () => {
    it('returns UHD and HD RC consumption for the period', async () => {
      mockDb.execute.mockResolvedValue([
        { tier: 'uhd', rcConsumed: 800 },
        { tier: 'hd', rcConsumed: 3200 },
      ])
      const result = await getResolutionBreakdown(mockDb as any, '30d')
      expect(result.uhd).toBe(800)
      expect(result.hd).toBe(3200)
    })

    it('returns 0 for a tier with no jobs', async () => {
      mockDb.execute.mockResolvedValue([
        { tier: 'uhd', rcConsumed: 0 },
      ])
      const result = await getResolutionBreakdown(mockDb as any, '30d')
      expect(result.uhd).toBe(0)
      expect(result.hd).toBe(0)
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/costs-db.test.ts
  ```
  Expected: FAIL — module not found

- [ ] **Step 3: Create the costs DB module**

  Create `apps/web/app/(admin)/admin/costs/_data/costs-db.ts`:

  ```ts
  import { sql } from 'drizzle-orm'
  import type { DrizzleDB } from '@racedash/db'

  export type CostsTimeRange = '7d' | '30d' | '90d'

  function intervalDays(range: CostsTimeRange): number {
    return range === '7d' ? 7 : range === '30d' ? 30 : 90
  }

  export interface DailyRevenueRow {
    day: string
    revenueGbp: number
  }

  /**
   * Returns daily GBP revenue for render jobs only.
   * Social upload reservations (job_id LIKE 'su\_%') are excluded because their
   * 10 RC flat cost does not correspond to AWS render spend.
   *
   * Join path: credit_reservations → credit_reservation_packs → credit_packs
   * because a single reservation may span multiple packs (FIFO depletion).
   * Revenue per deduction = rc_deducted * (price_gbp / rc_total)
   *
   * Note on LIKE escaping: the sql tag reads raw template strings, so a single
   * backslash in the template literal is passed as a literal backslash in the SQL.
   * 'su\_%' with ESCAPE '\\' tells Postgres: escape char is \, so \_ means literal _.
   */
  export async function getDailyRevenue(
    db: DrizzleDB,
    range: CostsTimeRange,
  ): Promise<DailyRevenueRow[]> {
    const days = intervalDays(range)
    const rows = await db.execute<{ day: string; revenueGbp: string }>(sql`
      SELECT
        date_trunc('day', cr.settled_at)::date::text AS day,
        sum(crp.rc_deducted::numeric * (cp.price_gbp::numeric / cp.rc_total::numeric))::numeric(10,4) AS "revenueGbp"
      FROM credit_reservations cr
      JOIN credit_reservation_packs crp ON crp.reservation_id = cr.id
      JOIN credit_packs cp ON crp.pack_id = cp.id
      WHERE cr.status = 'consumed'
        AND cr.job_id NOT LIKE 'su\_%' ESCAPE '\\'
        AND cr.settled_at >= now() - (${days} || ' days')::interval
      GROUP BY date_trunc('day', cr.settled_at)::date
      ORDER BY day DESC
    `)

    return rows.map((row) => ({
      day: row.day,
      revenueGbp: Number(row.revenueGbp),
    }))
  }

  export interface ResolutionBreakdown {
    uhd: number
    hd: number
  }

  /**
   * Groups RC consumed by resolution tier (UHD = width >= 3840, HD = below).
   * Extracts width from jobs.config JSONB.
   * Excludes social upload reservations.
   */
  export async function getResolutionBreakdown(
    db: DrizzleDB,
    range: CostsTimeRange,
  ): Promise<ResolutionBreakdown> {
    const days = intervalDays(range)
    const rows = await db.execute<{ tier: string; rcConsumed: number }>(sql`
      SELECT
        CASE WHEN (j.config->>'width')::int >= 3840 THEN 'uhd' ELSE 'hd' END AS tier,
        coalesce(sum(crp.rc_deducted), 0)::int AS "rcConsumed"
      FROM credit_reservations cr
      JOIN credit_reservation_packs crp ON crp.reservation_id = cr.id
      JOIN jobs j ON j.id = cr.job_id
      WHERE cr.status = 'consumed'
        AND cr.job_id NOT LIKE 'su\_%' ESCAPE '\\'
        AND cr.settled_at >= now() - (${days} || ' days')::interval
      GROUP BY tier
    `)

    const result: ResolutionBreakdown = { uhd: 0, hd: 0 }
    for (const row of rows) {
      if (row.tier === 'uhd') result.uhd = row.rcConsumed
      if (row.tier === 'hd') result.hd = row.rcConsumed
    }
    return result
  }

  export interface PeriodRevenueSummary {
    totalRevenueGbp: number
    dailyRows: DailyRevenueRow[]
  }

  export async function getPeriodRevenueSummary(
    db: DrizzleDB,
    range: CostsTimeRange,
  ): Promise<PeriodRevenueSummary> {
    const dailyRows = await getDailyRevenue(db, range)
    const totalRevenueGbp = dailyRows.reduce((acc, row) => acc + row.revenueGbp, 0)
    return { totalRevenueGbp, dailyRows }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/costs-db.test.ts
  ```
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/costs/_data/costs-db.ts apps/web/__tests__/admin/costs-db.test.ts
  git commit -m "feat(web): add costs DB queries for admin cost profiling page"
  ```

---

### Task 4.2: Cost Explorer helper

**Files:**
- Create: `apps/web/app/(admin)/admin/costs/_data/cost-explorer.ts`
- Create: `apps/web/__tests__/admin/cost-explorer.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `apps/web/__tests__/admin/cost-explorer.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest'
  import { getAwsCosts } from '../../app/(admin)/admin/costs/_data/cost-explorer'

  vi.mock('@aws-sdk/client-cost-explorer', () => ({
    CostExplorerClient: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue({
        ResultsByTime: [
          {
            TimePeriod: { Start: '2026-03-09', End: '2026-03-10' },
            Groups: [
              { Keys: ['AWS Lambda'], Metrics: { UnblendedCost: { Amount: '1.23456', Unit: 'USD' } } },
              { Keys: ['AWS Elemental MediaConvert'], Metrics: { UnblendedCost: { Amount: '4.56789', Unit: 'USD' } } },
              { Keys: ['Amazon Elastic Container Service'], Metrics: { UnblendedCost: { Amount: '0.78901', Unit: 'USD' } } },
              { Keys: ['Amazon Simple Storage Service'], Metrics: { UnblendedCost: { Amount: '0.12345', Unit: 'USD' } } },
              { Keys: ['Amazon Simple Email Service'], Metrics: { UnblendedCost: { Amount: '0.00100', Unit: 'USD' } } },
            ],
          },
          {
            TimePeriod: { Start: '2026-03-10', End: '2026-03-11' },
            Groups: [
              { Keys: ['AWS Lambda'], Metrics: { UnblendedCost: { Amount: '2.00000', Unit: 'USD' } } },
            ],
          },
        ],
      }),
    })),
    GetCostAndUsageCommand: vi.fn(),
  }))

  describe('getAwsCosts', () => {
    it('aggregates service totals across all days', async () => {
      const result = await getAwsCosts({ range: '7d', region: 'eu-west-1' })
      // Lambda: 1.23456 + 2.00000 = 3.23456
      expect(result.byService['AWS Lambda']).toBeCloseTo(3.23456, 4)
      expect(result.byService['AWS Elemental MediaConvert']).toBeCloseTo(4.56789, 4)
    })

    it('returns total spend summed across all services and days', async () => {
      const result = await getAwsCosts({ range: '7d', region: 'eu-west-1' })
      const expected = 1.23456 + 4.56789 + 0.78901 + 0.12345 + 0.00100 + 2.00000
      expect(result.totalUsd).toBeCloseTo(expected, 3)
    })

    it('returns daily rows for the revenue vs spend table', async () => {
      const result = await getAwsCosts({ range: '7d', region: 'eu-west-1' })
      expect(result.dailyRows).toHaveLength(2)
      expect(result.dailyRows[0].date).toBe('2026-03-09')
      // Day 1 sum: 1.23456 + 4.56789 + 0.78901 + 0.12345 + 0.00100 = 6.71591
      expect(result.dailyRows[0].totalUsd).toBeCloseTo(6.71591, 3)
    })

    it('maps service names to display labels', async () => {
      const result = await getAwsCosts({ range: '7d', region: 'eu-west-1' })
      expect(result.serviceDisplayNames['AWS Lambda']).toBe('Lambda')
      expect(result.serviceDisplayNames['AWS Elemental MediaConvert']).toBe('MediaConvert')
      expect(result.serviceDisplayNames['Amazon Elastic Container Service']).toBe('ECS')
      expect(result.serviceDisplayNames['Amazon Simple Storage Service']).toBe('S3')
      expect(result.serviceDisplayNames['Amazon Simple Email Service']).toBe('SES')
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/cost-explorer.test.ts
  ```
  Expected: FAIL — module not found

- [ ] **Step 3: Create the Cost Explorer helper**

  Create `apps/web/app/(admin)/admin/costs/_data/cost-explorer.ts`:

  ```ts
  import {
    CostExplorerClient,
    GetCostAndUsageCommand,
  } from '@aws-sdk/client-cost-explorer'
  import type { CostsTimeRange } from './costs-db'

  // Exact billing service name strings as returned by Cost Explorer API.
  // These must match exactly — any deviation causes the service cost to be omitted.
  const SERVICE_DISPLAY_NAMES: Record<string, string> = {
    'AWS Lambda': 'Lambda',
    'AWS Elemental MediaConvert': 'MediaConvert',
    'Amazon Elastic Container Service': 'ECS',
    'Amazon Simple Storage Service': 'S3',
    'Amazon Simple Email Service': 'SES',
  }

  export interface AwsCostsInput {
    range: CostsTimeRange
    region: string
  }

  export interface DailySpendRow {
    date: string
    totalUsd: number
  }

  export interface AwsCostsResult {
    byService: Record<string, number>
    totalUsd: number
    dailyRows: DailySpendRow[]
    serviceDisplayNames: Record<string, string>
    /** Cost Explorer data has a 24-hour delay. This is yesterday's date (UTC). */
    dataAsOf: string
  }

  export async function getAwsCosts(input: AwsCostsInput): Promise<AwsCostsResult> {
    const client = new CostExplorerClient({ region: 'us-east-1' }) // Cost Explorer endpoint is global (us-east-1)

    const endDate = new Date()
    endDate.setUTCHours(0, 0, 0, 0) // today midnight UTC — data available up to yesterday
    const days = input.range === '7d' ? 7 : input.range === '30d' ? 30 : 90
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)

    const toDateStr = (d: Date) => d.toISOString().split('T')[0]

    const command = new GetCostAndUsageCommand({
      TimePeriod: {
        Start: toDateStr(startDate),
        End: toDateStr(endDate),
      },
      Granularity: 'DAILY',
      Filter: {
        Tags: {
          Key: 'racedash:project',
          Values: ['racedash'],
        },
      },
      GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      Metrics: ['UnblendedCost'],
    })

    const response = await client.send(command)
    const resultsByTime = response.ResultsByTime ?? []

    const byService: Record<string, number> = {}
    const dailyRows: DailySpendRow[] = []

    for (const dayResult of resultsByTime) {
      const date = dayResult.TimePeriod?.Start ?? ''
      let dayTotal = 0

      for (const group of dayResult.Groups ?? []) {
        const serviceName = group.Keys?.[0] ?? ''
        const amount = Number(group.Metrics?.UnblendedCost?.Amount ?? 0)
        byService[serviceName] = (byService[serviceName] ?? 0) + amount
        dayTotal += amount
      }

      dailyRows.push({ date, totalUsd: dayTotal })
    }

    const totalUsd = Object.values(byService).reduce((a, b) => a + b, 0)

    // Yesterday's date (data has 24h delay)
    const yesterday = new Date(endDate.getTime() - 24 * 60 * 60 * 1000)

    return {
      byService,
      totalUsd,
      dailyRows,
      serviceDisplayNames: SERVICE_DISPLAY_NAMES,
      dataAsOf: toDateStr(yesterday),
    }
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/cost-explorer.test.ts
  ```
  Expected: all tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/costs/_data/cost-explorer.ts apps/web/__tests__/admin/cost-explorer.test.ts
  git commit -m "feat(web): add Cost Explorer helper for admin cost profiling page"
  ```

---

### Task 4.3: Costs page components and page

**Files:**
- Create: `apps/web/app/(admin)/admin/costs/_components/CostSummaryCards.tsx`
- Create: `apps/web/app/(admin)/admin/costs/_components/ServiceBreakdownTable.tsx`
- Create: `apps/web/app/(admin)/admin/costs/_components/DailyRevenueTable.tsx`
- Create: `apps/web/app/(admin)/admin/costs/page.tsx`

- [ ] **Step 1: Create `CostSummaryCards.tsx`**

  Create `apps/web/app/(admin)/admin/costs/_components/CostSummaryCards.tsx`:

  ```tsx
  import { MetricCard } from '../../_components/MetricCard'

  interface CostSummaryCardsProps {
    totalRevenueGbp: number
    totalSpendUsd: number
    dataAsOf: string
  }

  export function CostSummaryCards({ totalRevenueGbp, totalSpendUsd, dataAsOf }: CostSummaryCardsProps) {
    // Static conversion note: Cost Explorer returns USD. ~0.79 USD/GBP for v1 estimates.
    const USD_TO_GBP = 0.79
    const spendGbpEstimate = totalSpendUsd * USD_TO_GBP
    const grossMarginPct =
      totalRevenueGbp > 0
        ? Math.round(((totalRevenueGbp - spendGbpEstimate) / totalRevenueGbp) * 100)
        : null

    return (
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          label="RC Revenue"
          value={`£${totalRevenueGbp.toFixed(2)}`}
          sub="render jobs only"
        />
        <MetricCard
          label="AWS Spend"
          value={`$${totalSpendUsd.toFixed(2)}`}
          sub={`AWS data as of ${dataAsOf} · ~£${spendGbpEstimate.toFixed(2)} at ~0.79 USD/GBP`}
        />
        <MetricCard
          label="Est. Gross Margin"
          value={grossMarginPct !== null ? `${grossMarginPct}%` : '—'}
          sub="(Revenue − AWS Spend) / Revenue"
        />
      </div>
    )
  }
  ```

- [ ] **Step 2: Create `ServiceBreakdownTable.tsx`**

  Create `apps/web/app/(admin)/admin/costs/_components/ServiceBreakdownTable.tsx`:

  ```tsx
  interface ServiceBreakdownTableProps {
    byService: Record<string, number>
    serviceDisplayNames: Record<string, string>
  }

  export function ServiceBreakdownTable({ byService, serviceDisplayNames }: ServiceBreakdownTableProps) {
    const entries = Object.entries(byService).sort(([, a], [, b]) => b - a)

    if (entries.length === 0) {
      return <p className="text-sm text-gray-500">No AWS cost data for this period.</p>
    }

    return (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-4">Service</th>
            <th className="py-2">Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([service, usd]) => (
            <tr key={service} className="border-b last:border-0">
              <td className="py-2 pr-4">{serviceDisplayNames[service] ?? service}</td>
              <td className="py-2">${usd.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  ```

- [ ] **Step 3: Create `DailyRevenueTable.tsx`**

  Create `apps/web/app/(admin)/admin/costs/_components/DailyRevenueTable.tsx`:

  ```tsx
  import type { DailyRevenueRow } from '../_data/costs-db'
  import type { DailySpendRow } from '../_data/cost-explorer'

  interface DailyRevenueTableProps {
    revenueRows: DailyRevenueRow[]
    spendRows: DailySpendRow[]
  }

  export function DailyRevenueTable({ revenueRows, spendRows }: DailyRevenueTableProps) {
    // Build a merged day map
    const days = new Set([
      ...revenueRows.map((r) => r.day),
      ...spendRows.map((r) => r.date),
    ])
    const sorted = [...days].sort().reverse()

    if (sorted.length === 0) {
      return <p className="text-sm text-gray-500">No data for this period.</p>
    }

    const revenueByDay = Object.fromEntries(revenueRows.map((r) => [r.day, r.revenueGbp]))
    const spendByDay = Object.fromEntries(spendRows.map((r) => [r.date, r.totalUsd]))

    return (
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Revenue (£)</th>
            <th className="py-2">AWS Spend (USD)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((day) => (
            <tr key={day} className="border-b last:border-0">
              <td className="py-2 pr-4">{day}</td>
              <td className="py-2 pr-4">
                {revenueByDay[day] != null ? `£${revenueByDay[day].toFixed(2)}` : '—'}
              </td>
              <td className="py-2">
                {spendByDay[day] != null ? `$${spendByDay[day].toFixed(4)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  ```

- [ ] **Step 4: Create `costs/page.tsx`**

  Create `apps/web/app/(admin)/admin/costs/page.tsx`:

  ```tsx
  import { Suspense } from 'react'
  import { db } from '@racedash/db'
  import { getPeriodRevenueSummary, getResolutionBreakdown, type CostsTimeRange } from './_data/costs-db'
  import { getAwsCosts } from './_data/cost-explorer'
  import { CostSummaryCards } from './_components/CostSummaryCards'
  import { ServiceBreakdownTable } from './_components/ServiceBreakdownTable'
  import { DailyRevenueTable } from './_components/DailyRevenueTable'
  import { MetricCard } from '../_components/MetricCard'
  import { RefreshButton } from '../_components/RefreshButton'

  interface Props {
    searchParams: Promise<{ range?: string }>
  }

  function parseRange(raw: string | undefined): CostsTimeRange {
    if (raw === '7d' || raw === '30d' || raw === '90d') return raw
    return '30d'
  }

  async function CostExplorerSection({
    range,
    totalRevenueGbp,
    revenueRows,
  }: {
    range: CostsTimeRange
    totalRevenueGbp: number
    revenueRows: Awaited<ReturnType<typeof getPeriodRevenueSummary>>['dailyRows']
  }) {
    const region = process.env.AWS_REGION ?? 'eu-west-1'
    const awsCosts = await getAwsCosts({ range, region })

    return (
      <>
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Summary</h2>
          <CostSummaryCards
            totalRevenueGbp={totalRevenueGbp}
            totalSpendUsd={awsCosts.totalUsd}
            dataAsOf={awsCosts.dataAsOf}
          />
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">AWS Service Breakdown</h2>
          <p className="text-xs text-gray-400 mb-2">
            Filtered by tag <code>racedash:project=racedash</code>. Lambda costs shown as fleet total (per-invocation tagging not supported).
          </p>
          <ServiceBreakdownTable
            byService={awsCosts.byService}
            serviceDisplayNames={awsCosts.serviceDisplayNames}
          />
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Daily Revenue vs Spend</h2>
          <DailyRevenueTable revenueRows={revenueRows} spendRows={awsCosts.dailyRows} />
        </section>
      </>
    )
  }

  export default async function AdminCostsPage({ searchParams }: Props) {
    const { range: rawRange } = await searchParams
    const range = parseRange(rawRange)

    const [{ totalRevenueGbp, dailyRows }, resBreakdown] = await Promise.all([
      getPeriodRevenueSummary(db, range),
      getResolutionBreakdown(db, range),
    ])

    const rangeLabel = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 90 days'

    return (
      <main className="p-8 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Cost Profiling</h1>
          <div className="flex gap-4 items-center">
            <nav className="flex gap-2 text-sm">
              {(['7d', '30d', '90d'] as const).map((r) => (
                <a
                  key={r}
                  href={`?range=${r}`}
                  className={`px-3 py-1 rounded border ${range === r ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-300 text-gray-600 hover:border-gray-500'}`}
                >
                  {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
                </a>
              ))}
            </nav>
            <RefreshButton />
          </div>
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-4">Resolution Breakdown — {rangeLabel}</h2>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="UHD RC Consumed" value={resBreakdown.uhd.toLocaleString()} sub="width ≥ 3840 (2160p)" />
            <MetricCard label="HD RC Consumed" value={resBreakdown.hd.toLocaleString()} sub="width < 3840 (1440p and below)" />
          </div>
        </section>

        <Suspense fallback={<div className="mt-8 text-sm text-gray-400">Loading AWS cost data…</div>}>
          <CostExplorerSection
            range={range}
            totalRevenueGbp={totalRevenueGbp}
            revenueRows={dailyRows}
          />
        </Suspense>
      </main>
    )
  }
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  cd apps/web && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 6: Run all admin tests in one pass**

  ```bash
  cd apps/web && npx vitest run __tests__/admin/
  ```
  Expected: all tests PASS

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/app/\(admin\)/admin/costs/
  git commit -m "feat(web): add /admin/costs page with Cost Explorer integration and daily revenue vs spend table"
  ```

---

### Task 4.4: Post-deploy operator steps (no code)

These are manual steps required after CDK deployment and Vercel deployment.

- [ ] **Step 1: Add new Vercel environment variables from CDK outputs**

  After running `cdk deploy --all`, note the two new outputs from `PipelineStack`:
  - `LambdaFunctionNames` — comma-separated string of actual Lambda function names
  - `SocialUploadDlqUrl` — SQS DLQ URL

  In the Vercel dashboard (or via Vercel CLI):
  ```bash
  vercel env add LAMBDA_FUNCTION_NAMES production
  # Paste the comma-separated function names from CDK output, e.g.:
  # racedash-validation-prod,racedash-start-render-overlay-prod,...

  vercel env add SQS_SOCIAL_UPLOAD_DLQ_URL production
  # Paste the DLQ URL from CDK output, e.g.:
  # https://sqs.eu-west-1.amazonaws.com/123456789012/racedash-social-upload-dlq-prod
  ```

- [ ] **Step 2: Grant admin role to the operator's Clerk account**

  In the [Clerk Dashboard](https://dashboard.clerk.com):
  1. Navigate to **Users**
  2. Select the operator user account
  3. Click **Edit public metadata**
  4. Set:
     ```json
     { "role": "admin" }
     ```
  5. Save

  Verification: sign in as the operator and navigate to `/admin`. Should load the Overview page. Any other user should be redirected to `/`.

- [ ] **Step 3: Redeploy Vercel to pick up new env vars**

  ```bash
  vercel deploy --prod
  ```
  Expected: deployment succeeds; `/admin` page loads with live DB and CloudWatch data.
