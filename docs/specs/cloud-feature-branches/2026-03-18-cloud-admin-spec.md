# feature/cloud-admin — Branch Spec

**Date:** 2026-03-18
**Status:** Draft
**Branch:** `feature/cloud-admin`
**Depends on:** `feature/cloud-db`, `feature/cloud-auth`

---

## Overview

This branch delivers the internal admin dashboard (`apps/admin`) and the admin-specific API endpoints added to `apps/api`. The admin dashboard is a Next.js 16 App Router application (React + Tailwind + shadcn/ui) deployed on Vercel. It gives the platform operator visibility into users, licenses, jobs, and credits, plus the ability to take manual corrective actions (issue/revoke/extend licenses, grant/correct credits). All data flows through `apps/api` — the admin app never queries the database directly. Admin access is gated by a Clerk role check (`publicMetadata.role === 'admin'`).

Shell and UI work (routing, layout, static components) can begin immediately. API integration is blocked until `feature/cloud-auth` has landed and the `apps/api` Fastify scaffold exists.

---

## Scope

### In scope

- `apps/admin` Next.js 16 App Router scaffold (React + Tailwind + shadcn/ui), deployed on Vercel
- Admin auth: Clerk `@clerk/nextjs` middleware + layout role gate (`publicMetadata.role === 'admin'`); unauthenticated users are redirected to Clerk sign-in; non-admin authenticated users see an access-denied screen
- Admin API middleware added to `apps/api` — checks `publicMetadata.role === 'admin'` on all `/api/admin/*` routes
- Admin API endpoints added to `apps/api` for users, licenses, jobs, credits, and overview stats
- Dashboard overview page: in-flight job counts by status, completed/failed today, 7-day failure rate, recent failed jobs
- User list page with search and pagination
- User detail page: profile, licenses, credit packs, job history
- License management: issue, revoke, extend licenses from user detail page
- Job list page with status filter and time range filter
- Job detail page with full job record and Step Functions execution ARN link
- Credit management: manual credit adjustments (grants, corrections) from user detail page
- Audit logging: all admin write operations logged to an `admin_audit_log` table

### Out of scope

- CloudWatch integration (Lambda error rates, SFN failures, DLQ depth) — deferred to a future iteration
- Cost Explorer integration (AWS spend, gross margin) — deferred to a future iteration
- Costs page (`/costs`) — no data source without Cost Explorer; deferred entirely
- Credits overview page (expiry buckets, all-time totals, purchase history) — the prior spec's `/admin/credits` page is deferred; credit operations are accessed through user detail pages
- Real-time updates (SSE, WebSockets) — manual refresh is sufficient for an internal tool
- CSV export — can be added later
- Chart libraries — HTML tables only in v1
- Multi-admin permissions (all admins have equal access)

---

## Functional Requirements

### Admin App Scaffold

1. **FR-1:** `apps/admin` must be a Next.js 16 App Router application with TypeScript, Tailwind CSS, and shadcn/ui components. It must be a workspace package named `@racedash/admin` with `pnpm dev` and `pnpm build` scripts. It is deployed on Vercel.
2. **FR-2:** The app must use the Next.js App Router with the following routes:
   - `/` — Overview (dashboard home)
   - `/users` — User list
   - `/users/[id]` — User detail
   - `/jobs` — Job list
   - `/jobs/[id]` — Job detail
3. **FR-3:** The app must use `@clerk/nextjs` for authentication. `clerkMiddleware()` in `middleware.ts` protects all routes. The publishable key is provided via `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and the secret key via `CLERK_SECRET_KEY`.
4. **FR-4:** The root layout must check the authenticated user's `publicMetadata.role === 'admin'` via `auth()` from `@clerk/nextjs/server`. Non-admin authenticated users see an "Access Denied" page. Unauthenticated users are redirected to Clerk's sign-in page by `clerkMiddleware()`.
5. **FR-5:** The app must include a persistent sidebar navigation with links to Overview, Users, and Jobs.
6. **FR-6:** All API calls from the admin app must use the Clerk session token via `auth().getToken()` (in server components/actions) or `useAuth().getToken()` (in client components) as an `Authorization: Bearer` header. The API base URL is provided via `NEXT_PUBLIC_API_URL`.

### Admin Auth Middleware (apps/api)

7. **FR-7:** A new Fastify plugin `admin-auth.ts` must be registered on all `/api/admin/*` routes. It must verify that the authenticated Clerk user's `publicMetadata.role === 'admin'`. Non-admin users receive `403 Forbidden`.
8. **FR-8:** The admin auth middleware must layer on top of the existing Clerk auth middleware from `cloud-auth` (which handles JWT validation and populates `request.clerk`). The admin middleware only checks the role claim — it does not re-validate the JWT.

### Overview Page

9. **FR-9:** The overview page (`/`) must display:
   - In-flight job counts grouped by status (`uploading`, `queued`, `rendering`, `compositing`) as metric cards
   - Jobs completed today (since midnight UTC) as a metric card
   - Jobs failed today (since midnight UTC) as a metric card
   - 7-day failure rate (`failed / (complete + failed)` as a percentage) as a metric card
   - A table of the 10 most recent failed jobs with columns: Job ID, User Email, Error Message, Failed At
10. **FR-10:** The overview page must include a "Refresh" button that re-fetches all data.

### User List Page

11. **FR-11:** The user list page (`/users`) must display a paginated table of users with columns: Email, Clerk ID, License Tier (or "None"), Created At.
12. **FR-12:** The user list must support search by email (partial match, case-insensitive).
13. **FR-13:** Pagination must use cursor-based pagination with 50 users per page.

### User Detail Page

14. **FR-14:** The user detail page (`/users/:id`) must display:
   - User profile: email, Clerk ID, billing country, Stripe customer ID, created at
   - Active license: tier, status, starts at, expires at — with actions to Extend and Revoke
   - License history: all licenses (including expired/cancelled) in a table
   - Credit packs: pack name, RC total, RC remaining, purchased at, expires at — in a table
   - Manual credit adjustment form: RC amount (positive for grant, negative for correction), reason (required text field)
   - Recent jobs: 10 most recent jobs with status, created at, RC cost — linking to job detail

### License Management

15. **FR-15:** The "Issue License" action on a user detail page must open a dialog with fields: Tier (select: `plus` | `pro`), Starts At (date, defaults to now), Expires At (date, defaults to 1 year from now). Submitting calls `POST /api/admin/users/:id/licenses`.
16. **FR-16:** The "Extend License" action must open a dialog with a new Expires At date field. Submitting calls `PATCH /api/admin/users/:id/licenses/:licenseId` with the new expiry date.
17. **FR-17:** The "Revoke License" action must open a confirmation dialog. Confirming calls `PATCH /api/admin/users/:id/licenses/:licenseId` with `status: 'cancelled'`.

### Job Monitoring

18. **FR-18:** The job list page (`/jobs`) must display a paginated table with columns: Job ID, User Email, Status, RC Cost (shown for `complete` jobs where `FinaliseJob` has written the value; `—` for all other states including `failed`), Duration (derived: `updated_at - created_at` for terminal states, or `—`), Created At, Error Message (truncated).
19. **FR-19:** The job list must support filtering by status (multi-select from the status enum) and time range (last 7 days, last 30 days, all time).
20. **FR-20:** The job detail page (`/jobs/:id`) must display the full job record: all DB columns, plus a clickable link to the Step Functions execution in the AWS Console (constructed from `sfn_execution_arn`). The link format is `https://{region}.console.aws.amazon.com/states/home?region={region}#/executions/details/{sfn_execution_arn}`.
21. **FR-21:** The job detail page must also show credit reservation details: RC amount, status, and the packs it drew from (via `credit_reservation_packs`).

### Credit Management

22. **FR-22:** The manual credit adjustment form on the user detail page must call `POST /api/admin/users/:id/credits` with the RC amount and reason. Positive amounts create a new `credit_packs` row (grant). Negative amounts create a correction entry.
23. **FR-23:** Credit grants create a `credit_packs` row with `pack_name: 'Admin Grant'`, `rc_total` and `rc_remaining` set to the grant amount, `price_gbp: 0`, `purchased_at: now()`, `expires_at: now() + 12 months`, and `stripe_payment_intent_id: null`. The `cloud-db` spec defines `stripe_payment_intent_id` as `UNIQUE` (nullable), which already supports admin grants.
24. **FR-24:** Credit corrections (negative amounts) deduct from the user's credit packs using FIFO depletion logic (soonest-expiring first), implemented as a direct `UPDATE` on `credit_packs.rc_remaining` within a transaction — the same approach as `reserveCredits` but without creating a `credit_reservations` row (corrections are not jobs, so no reservation is needed). Note: `consumeCredits` from `@racedash/db` cannot be used here because it settles an existing reservation rather than deducting from packs.

### Audit Logging

25. **FR-25:** All admin write operations must be logged to an `admin_audit_log` table with columns: `id` (UUID), `admin_clerk_id` (text), `action` (text), `target_user_id` (UUID, nullable), `target_resource_type` (text), `target_resource_id` (text, nullable), `payload` (JSONB), `created_at` (timestamptz). This table is added to `@racedash/db` by this branch.
26. **FR-26:** The following actions must be logged: `license.issue`, `license.extend`, `license.revoke`, `credits.grant`, `credits.correction`.

---

## Non-Functional Requirements

1. **NFR-1:** All admin API endpoints must return paginated results for list queries. Page size defaults to 50, maximum 100.
2. **NFR-2:** The admin app must use server components by default, with client components only where interactivity is required (forms, dialogs, refresh buttons). This minimises the client bundle.
3. **NFR-3:** All admin API endpoints must respond within 500ms for typical queries (< 10,000 rows scanned).
4. **NFR-4:** The admin app must be buildable with `pnpm build` in the `apps/admin` directory and deployable to Vercel. The Vercel project root is set to `apps/admin`.
5. **NFR-5:** All exported functions and interfaces must have complete TypeScript type signatures (no `any` types).
6. **NFR-6:** The admin app must use the same Tailwind theme tokens (colours, spacing, radii) as the desktop app for visual consistency across RaceDash products.
7. **NFR-7:** All admin write operations must be atomic — if the audit log insert fails, the primary write must also roll back (use a DB transaction).

---

## App Structure

```
apps/admin/
  package.json
  tsconfig.json
  next.config.ts
  tailwind.config.ts
  postcss.config.js
  middleware.ts                            # Clerk clerkMiddleware() — protects all routes
  app/
    layout.tsx                            # Root layout: ClerkProvider + admin role guard + sidebar
    globals.css                           # Tailwind imports + shadcn/ui base styles
    page.tsx                              # Overview (dashboard home)
    users/
      page.tsx                            # User list
      [id]/
        page.tsx                          # User detail + license + credits + jobs
    jobs/
      page.tsx                            # Job list with filters
      [id]/
        page.tsx                          # Job detail
    access-denied/
      page.tsx                            # Shown to non-admin authenticated users
  lib/
    api.ts                               # Typed fetch wrapper (injects Clerk token, NEXT_PUBLIC_API_URL base)
    utils.ts                             # cn() helper, date formatting, etc.
  hooks/
    useAdminAuth.ts                      # Clerk useUser() + role check (client components)
    useApiMutation.ts                    # Mutation wrapper for POST/PATCH requests (client components)
  components/
    ui/                                  # shadcn/ui primitives (Button, Card, Table, Dialog, Input, Select, Badge, etc.)
    layout/
      Sidebar.tsx                        # Navigation sidebar
      PageHeader.tsx                     # Page title + breadcrumb + actions
      RefreshButton.tsx                  # Manual refresh trigger ('use client')
    users/
      UserTable.tsx                      # Paginated user list table
      UserProfile.tsx                    # User profile card
      LicenseCard.tsx                    # Active license display + actions
      LicenseHistoryTable.tsx            # All licenses for a user
      CreditPacksTable.tsx              # User's credit packs
      CreditAdjustmentForm.tsx          # Manual credit grant/correction form ('use client')
      IssueLicenseDialog.tsx            # Dialog for issuing a new license ('use client')
      ExtendLicenseDialog.tsx           # Dialog for extending license expiry ('use client')
      RevokeLicenseDialog.tsx           # Confirmation dialog for revoking a license ('use client')
      RecentJobsTable.tsx               # User's recent jobs (compact)
    jobs/
      JobTable.tsx                       # Paginated job list with filters
      JobStatusBadge.tsx                # Coloured badge per status
      JobDetail.tsx                      # Full job record display
      CreditReservationDetail.tsx       # Reservation + pack breakdown
      SfnExecutionLink.tsx              # Clickable AWS Console link
    overview/
      MetricCard.tsx                    # Single stat card (count + label)
      MetricCardsRow.tsx                # Row of metric cards
      RecentFailedJobsTable.tsx         # 10 most recent failed jobs
  test/
    components/
      overview/
        MetricCard.test.tsx
        RecentFailedJobsTable.test.tsx
      users/
        UserTable.test.tsx
        CreditAdjustmentForm.test.tsx
        IssueLicenseDialog.test.tsx
      jobs/
        JobTable.test.tsx
        JobStatusBadge.test.tsx
        SfnExecutionLink.test.tsx
    pages/
      OverviewPage.test.tsx
      AccessDeniedPage.test.tsx
    hooks/
      useAdminAuth.test.ts
    snapshots/
      MetricCard.snap.tsx
      JobStatusBadge.snap.tsx

apps/api/src/
  plugins/
    admin-auth.ts                       # Admin role check middleware
  routes/
    admin/
      index.ts                          # Admin route prefix registration
      users.ts                          # GET /api/admin/users, GET /api/admin/users/:id
      licenses.ts                       # POST /api/admin/users/:id/licenses, PATCH /api/admin/users/:id/licenses/:licenseId
      jobs.ts                           # GET /api/admin/jobs, GET /api/admin/jobs/:id
      credits.ts                        # POST /api/admin/users/:id/credits
      stats.ts                          # GET /api/admin/stats/overview
  types.ts                              # (modified) add admin request/response types

apps/api/test/
  plugins/
    admin-auth.test.ts
  routes/admin/
    users.test.ts
    licenses.test.ts
    jobs.test.ts
    credits.test.ts
    stats.test.ts
  properties/
    admin-auth.property.test.ts
  snapshots/
    admin-users.snap.ts
    admin-jobs.snap.ts
    admin-stats.snap.ts

packages/db/src/
  schema/
    admin-audit-log.ts                  # admin_audit_log table schema
  helpers/
    audit.ts                            # logAdminAction() helper
```

---

## Admin API Endpoints

All admin endpoints are prefixed with `/api/admin` and require both the standard Clerk auth middleware (JWT validation) and the admin auth middleware (role check).

### `GET /api/admin/stats/overview`

Returns dashboard overview statistics.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Response | `200 OK` |
| Errors | `401`, `403` |

**Response body:**

```json
{
  "inFlight": {
    "uploading": 2,
    "queued": 5,
    "rendering": 3,
    "compositing": 1
  },
  "completedToday": 47,
  "failedToday": 3,
  "failureRate7d": 4.2,
  "recentFailedJobs": [
    {
      "id": "uuid",
      "userEmail": "george@university.ac.uk",
      "errorMessage": "MediaConvert job failed: invalid input",
      "failedAt": "2026-03-18T14:30:00.000Z"
    }
  ]
}
```

### `GET /api/admin/users`

Paginated user list with optional email search.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Query params | `?search=<email>&cursor=<id>&limit=<n>` |
| Response | `200 OK` |
| Errors | `401`, `403` |

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `search` | `string` | — | Filter by email (case-insensitive `ILIKE %search%`) |
| `cursor` | `string` | — | User ID to start after (cursor-based pagination) |
| `limit` | `number` | `50` | Page size (max 100) |

**Response body:**

```json
{
  "users": [
    {
      "id": "uuid",
      "clerkId": "user_xxx",
      "email": "george@university.ac.uk",
      "licenseTier": "pro",
      "createdAt": "2026-03-18T00:00:00.000Z"
    }
  ],
  "nextCursor": "uuid-of-last-user"
}
```

`nextCursor` is `null` when there are no more pages.

### `GET /api/admin/users/:id`

Full user detail with licenses, credit packs, and recent jobs.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Response | `200 OK` |
| Errors | `401`, `403`, `404` |

**Response body:**

```json
{
  "user": {
    "id": "uuid",
    "clerkId": "user_xxx",
    "email": "george@university.ac.uk",
    "billingCountry": "GB",
    "stripeCustomerId": "cus_xxx",
    "createdAt": "2026-03-18T00:00:00.000Z"
  },
  "licenses": [
    {
      "id": "uuid",
      "tier": "pro",
      "status": "active",
      "stripeSubscriptionId": "sub_xxx",
      "startsAt": "2026-03-18T00:00:00.000Z",
      "expiresAt": "2027-03-18T00:00:00.000Z",
      "createdAt": "2026-03-18T00:00:00.000Z",
      "updatedAt": "2026-03-18T00:00:00.000Z"
    }
  ],
  "creditPacks": [
    {
      "id": "uuid",
      "packName": "Starter Pack",
      "rcTotal": 100,
      "rcRemaining": 42,
      "priceGbp": 9.99,
      "purchasedAt": "2026-03-18T00:00:00.000Z",
      "expiresAt": "2027-03-18T00:00:00.000Z"
    }
  ],
  "recentJobs": [
    {
      "id": "uuid",
      "status": "complete",
      "rcCost": 12,
      "createdAt": "2026-03-18T10:00:00.000Z",
      "updatedAt": "2026-03-18T10:05:00.000Z"
    }
  ]
}
```

### `POST /api/admin/users/:id/licenses`

Issue a new license manually.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Request | JSON body |
| Response | `201 Created` |
| Errors | `401`, `403`, `404`, `400` |

**Request body:**

```json
{
  "tier": "pro",
  "startsAt": "2026-03-18T00:00:00.000Z",
  "expiresAt": "2027-03-18T00:00:00.000Z"
}
```

**Response body:**

```json
{
  "license": {
    "id": "uuid",
    "userId": "uuid",
    "tier": "pro",
    "status": "active",
    "stripeCustomerId": null,
    "stripeSubscriptionId": null,
    "startsAt": "2026-03-18T00:00:00.000Z",
    "expiresAt": "2027-03-18T00:00:00.000Z",
    "createdAt": "2026-03-18T00:00:00.000Z",
    "updatedAt": "2026-03-18T00:00:00.000Z"
  }
}
```

**Validation:**
- `tier` must be `'plus'` or `'pro'`
- `startsAt` must be a valid ISO 8601 date
- `expiresAt` must be a valid ISO 8601 date and must be after `startsAt`

### `PATCH /api/admin/users/:id/licenses/:licenseId`

Extend or revoke an existing license.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Request | JSON body |
| Response | `200 OK` |
| Errors | `401`, `403`, `404`, `400` |

**Request body (extend):**

```json
{
  "expiresAt": "2027-06-18T00:00:00.000Z"
}
```

**Request body (revoke):**

```json
{
  "status": "cancelled"
}
```

**Response body:**

```json
{
  "license": {
    "id": "uuid",
    "userId": "uuid",
    "tier": "pro",
    "status": "active",
    "stripeCustomerId": null,
    "stripeSubscriptionId": null,
    "startsAt": "2026-03-18T00:00:00.000Z",
    "expiresAt": "2027-06-18T00:00:00.000Z",
    "createdAt": "2026-03-18T00:00:00.000Z",
    "updatedAt": "2026-03-18T12:00:00.000Z"
  }
}
```

**Validation:**
- If `expiresAt` is provided, it must be a valid ISO 8601 date in the future
- If `status` is provided, it must be `'cancelled'`
- At least one of `expiresAt` or `status` must be provided
- `expiresAt` and `status: 'cancelled'` are mutually exclusive — you extend or revoke, not both

### `GET /api/admin/jobs`

Paginated job list with filters.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Query params | `?status=<s>&range=<r>&cursor=<id>&limit=<n>` |
| Response | `200 OK` |
| Errors | `401`, `403` |

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `status` | `string` | — | Comma-separated status filter (e.g., `failed,rendering`) |
| `range` | `string` | `7d` | Time range: `7d`, `30d`, `all` |
| `cursor` | `string` | — | Job ID to start after (cursor-based pagination) |
| `limit` | `number` | `50` | Page size (max 100) |

**Response body:**

```json
{
  "jobs": [
    {
      "id": "uuid",
      "userEmail": "george@university.ac.uk",
      "status": "complete",
      "rcCost": 12,
      "createdAt": "2026-03-18T10:00:00.000Z",
      "updatedAt": "2026-03-18T10:05:00.000Z",
      "durationSec": 300,
      "errorMessage": null
    }
  ],
  "nextCursor": "uuid-of-last-job"
}
```

`durationSec` is computed server-side as `EXTRACT(EPOCH FROM updated_at - created_at)` for terminal states (`complete`, `failed`), `null` for non-terminal states. `rcCost` is the value written by `FinaliseJob` for `complete` jobs; `null` for all other states (including `failed`, where credits were released, not consumed).

### `GET /api/admin/jobs/:id`

Full job detail.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Response | `200 OK` |
| Errors | `401`, `403`, `404` |

**Response body:**

```json
{
  "job": {
    "id": "uuid",
    "userId": "uuid",
    "userEmail": "george@university.ac.uk",
    "status": "complete",
    "config": { "width": 1920, "height": 1080, "fps": 60 },
    "inputS3Keys": ["uploads/uuid/input.mp4"],
    "uploadIds": ["upload-id"],
    "outputS3Key": "renders/uuid/output.mp4",
    "downloadExpiresAt": "2026-03-25T10:05:00.000Z",
    "slotTaskToken": null,
    "renderTaskToken": null,
    "remotionRenderId": "render_xxx",
    "rcCost": 12,
    "sfnExecutionArn": "arn:aws:states:eu-west-2:123456789:execution:racedash-pipeline:uuid",
    "errorMessage": null,
    "createdAt": "2026-03-18T10:00:00.000Z",
    "updatedAt": "2026-03-18T10:05:00.000Z"
  },
  "sfnConsoleUrl": "https://eu-west-2.console.aws.amazon.com/states/home?region=eu-west-2#/executions/details/arn:aws:states:eu-west-2:123456789:execution:racedash-pipeline:uuid",
  "creditReservation": {
    "id": "uuid",
    "rcAmount": 12,
    "status": "consumed",
    "createdAt": "2026-03-18T10:00:00.000Z",
    "settledAt": "2026-03-18T10:05:00.000Z",
    "packs": [
      {
        "packId": "uuid",
        "packName": "Starter Pack",
        "rcDeducted": 12
      }
    ]
  }
}
```

`sfnConsoleUrl` is `null` when `sfnExecutionArn` is `null`. `creditReservation` is `null` when no reservation exists for the job.

### `POST /api/admin/users/:id/credits`

Manual credit adjustment.

| Field | Value |
|---|---|
| Auth | Bearer token + admin role |
| Request | JSON body |
| Response | `201 Created` |
| Errors | `401`, `403`, `404`, `400` |

**Request body:**

```json
{
  "rcAmount": 50,
  "reason": "Compensation for failed render job abc-123"
}
```

**Validation:**
- `rcAmount` must be a non-zero integer
- `reason` must be a non-empty string (max 500 characters)
- For negative amounts (corrections): the user must have sufficient remaining credits; if not, return `400` with code `INSUFFICIENT_CREDITS`

**Response body (grant, rcAmount > 0):**

```json
{
  "adjustment": {
    "type": "grant",
    "rcAmount": 50,
    "reason": "Compensation for failed render job abc-123",
    "creditPack": {
      "id": "uuid",
      "packName": "Admin Grant",
      "rcTotal": 50,
      "rcRemaining": 50,
      "priceGbp": 0,
      "purchasedAt": "2026-03-18T12:00:00.000Z",
      "expiresAt": "2027-03-18T12:00:00.000Z"
    }
  }
}
```

**Response body (correction, rcAmount < 0):**

```json
{
  "adjustment": {
    "type": "correction",
    "rcAmount": -10,
    "reason": "Duplicate credit pack issued in error",
    "rcDeducted": 10,
    "packsAffected": [
      { "packId": "uuid", "packName": "Starter Pack", "rcDeducted": 10 }
    ]
  }
}
```

---

## Page Designs

### Overview (`/`)

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar  │  Overview                         [Refresh]     │
│           │                                                 │
│  Overview │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  Users    │  │Uploading │ │ Queued   │ │Rendering │ ...     │
│  Jobs     │  │    2     │ │    5     │ │    3     │        │
│           │  └──────────┘ └──────────┘ └──────────┘        │
│           │                                                 │
│           │  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│           │  │Completed │ │ Failed   │ │ 7d Fail  │        │
│           │  │ Today    │ │ Today    │ │  Rate    │        │
│           │  │   47     │ │    3     │ │  4.2%    │        │
│           │  └──────────┘ └──────────┘ └──────────┘        │
│           │                                                 │
│           │  Recent Failed Jobs                             │
│           │  ┌─────────────────────────────────────┐        │
│           │  │ Job ID │ User │ Error │ Failed At   │        │
│           │  │ abc... │ GG   │ Med...│ 14:30       │        │
│           │  └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Users (`/users`)

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar  │  Users                                          │
│           │                                                 │
│           │  [Search by email... ]                           │
│           │                                                 │
│           │  ┌──────────────────────────────────────────┐    │
│           │  │ Email          │ Clerk ID │ Tier │ Created│   │
│           │  │ g@uni.ac.uk   │ user_xx  │ PRO  │ Mar 18 │   │
│           │  │ ...            │ ...      │ ...  │ ...    │   │
│           │  └──────────────────────────────────────────┘    │
│           │                                                 │
│           │  [← Previous] Page 1 [Next →]                   │
└─────────────────────────────────────────────────────────────┘
```

### User Detail (`/users/:id`)

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar  │  ← Users / G. Gorzynski                         │
│           │                                                 │
│           │  Profile                                        │
│           │  Email: george@university.ac.uk                 │
│           │  Clerk ID: user_xxx                             │
│           │  Billing Country: GB                            │
│           │  Stripe: cus_xxx                                │
│           │  Member since: 18 Mar 2026                      │
│           │                                                 │
│           │  Active License                [Extend] [Revoke]│
│           │  Tier: PRO  Status: Active                      │
│           │  Expires: 18 Mar 2027                           │
│           │                        [Issue New License]       │
│           │                                                 │
│           │  Credit Packs                                   │
│           │  ┌───────────────────────────────────────┐      │
│           │  │ Pack    │ Total │ Left │ Expires      │      │
│           │  │ Starter │  100  │  42  │ 18 Mar 2027  │      │
│           │  └───────────────────────────────────────┘      │
│           │                                                 │
│           │  Credit Adjustment                              │
│           │  RC Amount: [____]  Reason: [______________]    │
│           │  [Apply Adjustment]                             │
│           │                                                 │
│           │  Recent Jobs                                    │
│           │  ┌─────────────────────────────────────┐        │
│           │  │ Job ID │ Status │ RC Cost │ Created │        │
│           │  │ abc... │ ✓ Done │   12    │ 10:00   │        │
│           │  └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Jobs (`/jobs`)

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar  │  Jobs                                           │
│           │                                                 │
│           │  Status: [All ▾]    Range: [7 days ▾]           │
│           │                                                 │
│           │  ┌──────────────────────────────────────────┐    │
│           │  │ Job ID │ User  │ Status │ RC │ Dur │ Err │   │
│           │  │ abc..  │ GG    │ Done   │ 12 │ 5m  │  —  │   │
│           │  │ def..  │ GG    │ Failed │  — │ 2m  │ Med │   │
│           │  └──────────────────────────────────────────┘    │
│           │                                                 │
│           │  [← Previous] [Next →]                          │
└─────────────────────────────────────────────────────────────┘
```

### Job Detail (`/jobs/:id`)

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar  │  ← Jobs / abc-123-def                           │
│           │                                                 │
│           │  Status: COMPLETE      RC Cost: 12              │
│           │  User: george@university.ac.uk                  │
│           │  Created: 18 Mar 2026, 10:00                    │
│           │  Updated: 18 Mar 2026, 10:05                    │
│           │  Duration: 5m 0s                                │
│           │                                                 │
│           │  Config: 1920x1080 @ 60fps                      │
│           │  Input: uploads/abc/input.mp4                   │
│           │  Output: renders/abc/output.mp4                 │
│           │  Download expires: 25 Mar 2026, 10:05           │
│           │                                                 │
│           │  Step Functions: [View in AWS Console ↗]        │
│           │  Remotion Render ID: render_xxx                 │
│           │                                                 │
│           │  Credit Reservation                             │
│           │  Amount: 12 RC  Status: consumed                │
│           │  Packs: Starter Pack → 12 RC                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Admin Auth

### Admin App (apps/admin)

The admin app uses `@clerk/nextjs`. Authentication is enforced at two levels:

**1. Middleware (`middleware.ts`)** — `clerkMiddleware()` protects all routes. Unauthenticated users are redirected to Clerk's hosted sign-in page.

```ts
// apps/admin/middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
```

**2. Root layout (`app/layout.tsx`)** — checks the admin role after authentication. Non-admin users are redirected to the access-denied page.

```tsx
// apps/admin/app/layout.tsx
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ClerkProvider } from '@clerk/nextjs'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId, sessionClaims } = await auth()

  if (userId && sessionClaims?.publicMetadata?.role !== 'admin') {
    redirect('/access-denied')
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Sidebar />
          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

### API Middleware (apps/api)

The admin auth middleware is a Fastify plugin registered on the `/api/admin` route prefix:

```ts
// apps/api/src/plugins/admin-auth.ts
import { FastifyPluginAsync } from 'fastify'
import { clerkClient } from '../lib/clerk'

const adminAuth: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    // request.clerk is already populated by the Clerk auth middleware
    const clerkUserId = request.clerk.userId

    const user = await clerkClient.users.getUser(clerkUserId)
    if (user.publicMetadata.role !== 'admin') {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      })
    }
  })
}

export default adminAuth
```

### Granting Admin Access

Set `publicMetadata: { role: 'admin' }` on the relevant Clerk user via:
1. The Clerk Dashboard UI (Backend API > Users > select user > Metadata > Public)
2. Or the Clerk Backend API: `clerkClient.users.updateUser(userId, { publicMetadata: { role: 'admin' } })`

---

## Success Criteria

1. **SC-1:** An admin user can sign in to `apps/admin`, see the overview dashboard with live job counts, and refresh the data.
2. **SC-2:** A non-admin authenticated user sees the "Access Denied" page on all admin routes and receives `403` from all admin API endpoints.
3. **SC-3:** An unauthenticated user is redirected to Clerk's hosted sign-in page when visiting any admin route (enforced by `clerkMiddleware()`).
4. **SC-4:** An admin can search for a user by email and navigate to their detail page to see profile, licenses, credit packs, and job history.
5. **SC-5:** An admin can issue a new license to a user with a specified tier and expiry, and the license appears immediately in the user's license list.
6. **SC-6:** An admin can extend an existing license's expiry date, and the new expiry is reflected in the user detail page.
7. **SC-7:** An admin can revoke a license, setting its status to `cancelled`, and the user's active license section updates accordingly.
8. **SC-8:** An admin can grant credits to a user, creating a new credit pack with `pack_name = 'Admin Grant'` and the specified RC amount.
9. **SC-9:** An admin can apply a negative credit correction, and the user's credit packs are depleted using FIFO logic.
10. **SC-10:** An admin can browse the job list with status and time range filters, click through to a job detail page, and follow the Step Functions execution link to the AWS Console.
11. **SC-11:** All admin write operations (license issue/extend/revoke, credit grant/correction) create a corresponding row in the `admin_audit_log` table with the admin's Clerk ID, action type, and payload.
12. **SC-12:** All admin list endpoints support cursor-based pagination and return correct `nextCursor` values.
13. **SC-13:** `apps/admin` builds successfully with `pnpm build` and deploys to Vercel without errors.

---

## User Stories

1. **US-1 (Platform operator — system health):** As an admin, I want to see an at-a-glance overview of in-flight and failed jobs so that I can quickly identify if the pipeline is healthy or degraded.
2. **US-2 (Platform operator — user lookup):** As an admin, I want to search for a user by email so that I can inspect their account when they contact support.
3. **US-3 (Platform operator — license issue):** As an admin, I want to manually issue a license to a user so that I can grant access to beta testers or resolve billing issues.
4. **US-4 (Platform operator — license extend):** As an admin, I want to extend a user's license expiry so that I can compensate for downtime or service issues.
5. **US-5 (Platform operator — license revoke):** As an admin, I want to revoke a user's license so that I can enforce terms of service or handle refunds.
6. **US-6 (Platform operator — credit grant):** As an admin, I want to grant credits to a user so that I can compensate for failed renders or offer promotional credits.
7. **US-7 (Platform operator — credit correction):** As an admin, I want to deduct credits from a user so that I can correct accidental double-grants or system errors.
8. **US-8 (Platform operator — job investigation):** As an admin, I want to view a failed job's details and follow the Step Functions link so that I can diagnose pipeline failures.
9. **US-9 (Platform operator — audit trail):** As an admin, I want all my manual actions logged so that there is an immutable record of administrative changes for accountability.
10. **US-10 (Platform operator — job filtering):** As an admin, I want to filter jobs by status and time range so that I can focus on specific failure windows or pipeline stages.

---

## UI Mocks to Produce

The following Paper mockups should be created before implementation begins. All placeholder names must use "G. Gorzynski" with "GG" initials.

1. **Overview page:** Full dashboard with metric cards (in-flight counts, completed/failed today, 7-day failure rate) and recent failed jobs table.
2. **User list page:** Paginated table with email search input, showing G. Gorzynski as the first user with PRO tier badge.
3. **User detail page — full state:** Profile card, active PRO license with Extend/Revoke buttons, credit packs table, credit adjustment form, recent jobs table.
4. **User detail page — no license:** Same as above but with no active license section; "Issue New License" button prominent.
5. **Issue License dialog:** Modal with Tier select (Plus/Pro), Starts At date picker, Expires At date picker, and Submit button.
6. **Extend License dialog:** Modal with current expiry shown, new Expires At date picker, and Submit button.
7. **Revoke License dialog:** Destructive confirmation modal with "This action cannot be undone" warning and red Revoke button.
8. **Job list page:** Paginated table with status multi-select filter and time range dropdown, showing jobs with status badges.
9. **Job detail page:** Full job record with Step Functions console link, config breakdown, and credit reservation details.
10. **Access Denied page:** Simple centered message: "Access Denied — You do not have permission to view the admin dashboard."
11. **Sidebar navigation:** Vertical sidebar with RaceDash Admin logo, Overview/Users/Jobs nav links, and admin user avatar at the bottom.

---

## Happy Paths

### HP-1: View system health

1. Admin opens `apps/admin` in a browser.
2. Clerk authenticates the admin (role is `admin` in `publicMetadata`).
3. Overview page loads, showing in-flight job counts, completed/failed today, and the 7-day failure rate.
4. Admin sees 3 failed jobs today — scrolls down to the recent failed jobs table to read error messages.
5. Admin clicks "Refresh" to get the latest data.

### HP-2: Look up a user and review their account

1. Admin navigates to `/users`.
2. Admin types "gorzynski" into the search box.
3. User list filters to show G. Gorzynski's row.
4. Admin clicks the row to navigate to `/users/:id`.
5. Admin sees the full profile, active Pro license (expiring Mar 2027), two credit packs (Starter Pack with 42 RC remaining, Admin Grant with 50 RC remaining), and 10 recent jobs.

### HP-3: Issue a license to a new user

1. Admin navigates to a user's detail page who has no active license.
2. Admin clicks "Issue New License".
3. Dialog opens with Tier set to "Plus", Starts At defaulting to today, Expires At defaulting to one year from today.
4. Admin selects "Pro" tier and clicks "Submit".
5. API creates a new license row, logs the action to `admin_audit_log`, and returns the created license.
6. The user detail page updates to show the new active Pro license.

### HP-4: Extend a license

1. Admin navigates to a user detail page with an active license expiring 18 Mar 2027.
2. Admin clicks "Extend" on the active license card.
3. Dialog opens showing current expiry (18 Mar 2027) and a date picker for the new expiry.
4. Admin sets the new expiry to 18 Jun 2027 and clicks "Submit".
5. API updates the license row, logs the action, and returns the updated license.
6. The license card updates to show the new expiry date.

### HP-5: Revoke a license

1. Admin navigates to a user detail page with an active Pro license.
2. Admin clicks "Revoke" on the active license card.
3. Confirmation dialog appears: "This will cancel the user's Pro license. This action cannot be undone."
4. Admin clicks "Revoke" (red button).
5. API sets the license status to `cancelled`, logs the action, and returns the updated license.
6. The active license section disappears; the license appears in the license history table as "Cancelled".

### HP-6: Grant credits

1. Admin navigates to a user detail page.
2. In the Credit Adjustment section, admin enters `50` in the RC Amount field and "Compensation for failed render job abc-123" in the Reason field.
3. Admin clicks "Apply Adjustment".
4. API creates a new credit pack (`Admin Grant`, 50 RC, 12-month expiry, price GBP 0), logs the action, and returns the created pack.
5. The credit packs table updates to show the new Admin Grant pack.

### HP-7: Inspect a failed job

1. Admin navigates to `/jobs` and filters by status "Failed" and range "Last 7 days".
2. Admin sees a list of failed jobs with truncated error messages.
3. Admin clicks on job `abc-123` to navigate to `/jobs/abc-123`.
4. Job detail page shows the full error message: "MediaConvert job failed: invalid input format".
5. Admin clicks "View in AWS Console" to open the Step Functions execution in a new tab.
6. Admin reviews the execution history in the AWS Console to diagnose the failure.

### HP-8: Correct a credit error

1. Admin navigates to a user detail page and notices a duplicate Admin Grant pack (issued by mistake).
2. In the Credit Adjustment section, admin enters `-50` and "Correction: duplicate Admin Grant issued in error".
3. Admin clicks "Apply Adjustment".
4. API deducts 50 RC from the user's packs (FIFO, soonest-expiring first), logs the action, and returns the affected packs.
5. The credit packs table updates to show the reduced remaining amounts.

---

## Security Considerations

1. **Admin role enforcement (API):** The admin auth middleware checks `publicMetadata.role === 'admin'` on every request to `/api/admin/*`. The role is fetched from Clerk's backend API (not from the JWT claims alone) to ensure revocation takes effect immediately without waiting for JWT expiry.
2. **Admin role enforcement (Next.js):** The root layout checks the admin role server-side via `auth()` from `@clerk/nextjs/server`. This runs on every request before rendering. The API middleware remains the authoritative gate for all data access.
3. **Audit trail:** All admin write operations are logged to `admin_audit_log` within the same DB transaction as the primary mutation. The audit log captures the admin's Clerk ID, the action type, the affected resource, and the full request payload. Audit log rows are append-only — no UPDATE or DELETE operations are permitted on this table.
4. **Input validation:** All admin API endpoints validate request bodies using Zod schemas. Invalid inputs return `400` with descriptive error messages. Numeric fields (`rcAmount`, `limit`) have explicit min/max bounds to prevent abuse.
5. **Rate limiting:** Admin endpoints should be rate-limited to 100 requests per minute per admin user. This is implemented at the Fastify plugin level, not at the infrastructure level.
6. **CORS:** The admin app is hosted on Vercel on a separate origin from the API. The API must include the admin app's origin in its CORS allowlist. The CORS origin is configured via `ADMIN_APP_ORIGIN` environment variable (e.g., `https://admin.racedash.com`).
7. **No direct DB access:** The admin app never connects to the database directly. All data flows through the authenticated API endpoints. This ensures the audit trail cannot be bypassed.
8. **Sensitive field handling:** Task tokens (`slot_task_token`, `render_task_token`) are included in the job detail API response for debugging purposes. These tokens are single-use and expire after the state machine completes, so exposure to an authenticated admin is acceptable.
9. **Credit correction bounds:** Negative credit adjustments are bounded by the user's current RC balance. The API rejects corrections that would result in negative remaining credits.

---

## Infrastructure

### Admin App Deployment

The admin app is deployed on **Vercel**. The Vercel project is configured with:
- **Root directory:** `apps/admin`
- **Framework preset:** Next.js
- **Build command:** `pnpm build` (Vercel auto-detects Next.js)
- **Environment variables:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_API_URL`

The admin app is hosted at a separate subdomain (e.g., `admin.racedash.com`) and is completely independent of the AWS infrastructure used by `apps/api`. Clerk middleware enforces authentication server-side — unauthenticated requests never reach the page components.

### Environment Variables

| Variable | Runtime | Description |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `apps/admin` (Vercel) | Clerk publishable key (same instance as main platform) |
| `CLERK_SECRET_KEY` | `apps/admin` (Vercel, server-side) | Clerk secret key for server-side auth in middleware and layouts |
| `NEXT_PUBLIC_API_URL` | `apps/admin` (Vercel) | `apps/api` Lambda Function URL base |
| `ADMIN_APP_ORIGIN` | `apps/api` (runtime) | Admin app Vercel origin for CORS (e.g., `https://admin.racedash.com`) |

### DB Schema Addition

This branch adds one table to `@racedash/db`. While `cloud-db` owns the initial schema, this table is admin-specific and was not part of the epic's `cloud-db` scope. It is added as a Drizzle migration in `packages/db` by this branch:

```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_clerk_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES users(id),
  target_resource_type TEXT NOT NULL,
  target_resource_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_admin ON admin_audit_log(admin_clerk_id);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX idx_admin_audit_log_target_user ON admin_audit_log(target_user_id);
CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at);
```

---

## API Contracts

### Shared types (`apps/api/src/types.ts` — additions)

```ts
// ── Admin types ──────────────────────────────────────────────────────────

// ── Shared ───────────────────────────────────────────────────────────────

export type JobStatus = 'uploading' | 'queued' | 'rendering' | 'compositing' | 'complete' | 'failed'
export type LicenseTier = 'plus' | 'pro'
export type LicenseStatus = 'active' | 'expired' | 'cancelled'

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor: string | null
}

// ── GET /api/admin/stats/overview ────────────────────────────────────────

export interface AdminOverviewInFlight {
  uploading: number
  queued: number
  rendering: number
  compositing: number
}

export interface AdminRecentFailedJob {
  id: string
  userEmail: string
  errorMessage: string | null
  failedAt: string // ISO 8601
}

export interface AdminOverviewResponse {
  inFlight: AdminOverviewInFlight
  completedToday: number
  failedToday: number
  failureRate7d: number // percentage, e.g. 4.2
  recentFailedJobs: AdminRecentFailedJob[]
}

// ── GET /api/admin/users ─────────────────────────────────────────────────

export interface AdminUserListParams {
  search?: string
  cursor?: string
  limit?: number // default 50, max 100
}

export interface AdminUserListItem {
  id: string
  clerkId: string
  email: string
  licenseTier: LicenseTier | null
  createdAt: string // ISO 8601
}

export interface AdminUserListResponse {
  users: AdminUserListItem[]
  nextCursor: string | null
}

// ── GET /api/admin/users/:id ─────────────────────────────────────────────

export interface AdminUserProfile {
  id: string
  clerkId: string
  email: string
  billingCountry: string | null
  stripeCustomerId: string | null
  createdAt: string // ISO 8601
}

export interface AdminLicense {
  id: string
  tier: LicenseTier
  status: LicenseStatus
  stripeSubscriptionId: string | null
  startsAt: string // ISO 8601
  expiresAt: string // ISO 8601
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

export interface AdminCreditPack {
  id: string
  packName: string
  rcTotal: number
  rcRemaining: number
  priceGbp: number
  purchasedAt: string // ISO 8601
  expiresAt: string // ISO 8601
}

export interface AdminUserRecentJob {
  id: string
  status: JobStatus
  rcCost: number | null
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

export interface AdminUserDetailResponse {
  user: AdminUserProfile
  licenses: AdminLicense[]
  creditPacks: AdminCreditPack[]
  recentJobs: AdminUserRecentJob[]
}

// ── POST /api/admin/users/:id/licenses ───────────────────────────────────

export interface AdminIssueLicenseRequest {
  tier: LicenseTier
  startsAt: string // ISO 8601
  expiresAt: string // ISO 8601
}

export interface AdminIssueLicenseResponse {
  license: AdminLicense & { userId: string }
}

// ── PATCH /api/admin/users/:id/licenses/:licenseId ───────────────────────

export interface AdminUpdateLicenseRequest {
  expiresAt?: string // ISO 8601 — extend
  status?: 'cancelled' // revoke
}

export interface AdminUpdateLicenseResponse {
  license: AdminLicense & { userId: string }
}

// ── GET /api/admin/jobs ──────────────────────────────────────────────────

export interface AdminJobListParams {
  status?: string // comma-separated JobStatus values
  range?: '7d' | '30d' | 'all' // default '7d'
  cursor?: string
  limit?: number // default 50, max 100
}

export interface AdminJobListItem {
  id: string
  userEmail: string
  status: JobStatus
  rcCost: number | null
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
  durationSec: number | null // null for non-terminal
  errorMessage: string | null
}

export interface AdminJobListResponse {
  jobs: AdminJobListItem[]
  nextCursor: string | null
}

// ── GET /api/admin/jobs/:id ──────────────────────────────────────────────

export interface AdminJobConfig {
  width: number
  height: number
  fps: number
  [key: string]: unknown // other config fields
}

export interface AdminJobDetail {
  id: string
  userId: string
  userEmail: string
  status: JobStatus
  config: AdminJobConfig
  inputS3Keys: string[]
  uploadIds: string[]
  outputS3Key: string | null
  downloadExpiresAt: string | null // ISO 8601
  slotTaskToken: string | null
  renderTaskToken: string | null
  remotionRenderId: string | null
  rcCost: number | null
  sfnExecutionArn: string | null
  errorMessage: string | null
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

export interface AdminCreditReservationPack {
  packId: string
  packName: string
  rcDeducted: number
}

export interface AdminCreditReservation {
  id: string
  rcAmount: number
  status: string
  createdAt: string // ISO 8601
  settledAt: string | null // ISO 8601
  packs: AdminCreditReservationPack[]
}

export interface AdminJobDetailResponse {
  job: AdminJobDetail
  sfnConsoleUrl: string | null
  creditReservation: AdminCreditReservation | null
}

// ── POST /api/admin/users/:id/credits ────────────────────────────────────

export interface AdminCreditAdjustmentRequest {
  rcAmount: number // positive = grant, negative = correction; must be non-zero
  reason: string // non-empty, max 500 chars
}

export interface AdminCreditGrantResponse {
  adjustment: {
    type: 'grant'
    rcAmount: number
    reason: string
    creditPack: AdminCreditPack
  }
}

export interface AdminCreditCorrectionPackAffected {
  packId: string
  packName: string
  rcDeducted: number
}

export interface AdminCreditCorrectionResponse {
  adjustment: {
    type: 'correction'
    rcAmount: number // negative
    reason: string
    rcDeducted: number
    packsAffected: AdminCreditCorrectionPackAffected[]
  }
}

export type AdminCreditAdjustmentResponse = AdminCreditGrantResponse | AdminCreditCorrectionResponse

// ── Admin Audit Log ──────────────────────────────────────────────────────

export type AdminAuditAction =
  | 'license.issue'
  | 'license.extend'
  | 'license.revoke'
  | 'credits.grant'
  | 'credits.correction'

// ── Admin error codes ────────────────────────────────────────────────────

// Additional error codes for admin endpoints (extends base ApiError from cloud-auth):
//
// | HTTP Status | error.code              | When                                                    |
// |-------------|-------------------------|---------------------------------------------------------|
// | 400         | VALIDATION_ERROR        | Request body fails Zod validation                       |
// | 400         | INSUFFICIENT_CREDITS    | Negative credit adjustment exceeds available balance     |
// | 400         | INVALID_LICENSE_UPDATE   | expiresAt and status both provided, or neither provided  |
// | 403         | FORBIDDEN               | Authenticated user is not an admin                       |
// | 404         | USER_NOT_FOUND          | Target user ID does not exist                            |
// | 404         | LICENSE_NOT_FOUND       | Target license ID does not exist for the given user      |
// | 404         | JOB_NOT_FOUND           | Target job ID does not exist                             |
```

### Drizzle schema addition (`packages/db/src/schema/admin-audit-log.ts`)

```ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'

export const adminAuditLog = pgTable('admin_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminClerkId: text('admin_clerk_id').notNull(),
  action: text('action').notNull(),
  targetUserId: uuid('target_user_id').references(() => users.id),
  targetResourceType: text('target_resource_type').notNull(),
  targetResourceId: text('target_resource_id'),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### Audit log helper (`packages/db/src/helpers/audit.ts`)

```ts
import { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import { adminAuditLog } from '../schema/admin-audit-log'
// AdminAuditAction is defined locally in @racedash/db — no cross-package import
export type AdminAuditAction =
  | 'license.issue' | 'license.extend' | 'license.revoke'
  | 'credits.grant' | 'credits.correction'

export interface LogAdminActionParams {
  adminClerkId: string
  action: AdminAuditAction
  targetUserId?: string
  targetResourceType: string
  targetResourceId?: string
  payload: Record<string, unknown>
}

export async function logAdminAction(
  db: NeonHttpDatabase,
  params: LogAdminActionParams,
): Promise<void> {
  await db.insert(adminAuditLog).values({
    adminClerkId: params.adminClerkId,
    action: params.action,
    targetUserId: params.targetUserId,
    targetResourceType: params.targetResourceType,
    targetResourceId: params.targetResourceId,
    payload: params.payload,
  })
}
```

---

## Tests

### Specification Tests

Unit tests using Vitest. Each test targets a specific functional requirement.

**`apps/api/test/plugins/admin-auth.test.ts`**

| Test | FR |
|---|---|
| Rejects request from non-admin user with 403 | FR-7 |
| Accepts request from admin user (role === 'admin' in publicMetadata) | FR-7 |
| Rejects unauthenticated request with 401 (upstream Clerk middleware) | FR-8 |
| Admin check happens after Clerk JWT validation (does not bypass auth) | FR-8 |

**`apps/api/test/routes/admin/users.test.ts`**

| Test | FR |
|---|---|
| Returns paginated user list with default page size 50 | FR-11, FR-13 |
| Filters users by email search (case-insensitive partial match) | FR-12 |
| Returns correct `nextCursor` when more pages exist | FR-13 |
| Returns `nextCursor: null` on last page | FR-13 |
| Respects `limit` param (capped at 100) | NFR-1 |
| Returns user detail with profile, licenses, credit packs, and recent jobs | FR-14 |
| Returns 404 for non-existent user ID | FR-14 |
| Returns empty arrays for user with no licenses, credit packs, or jobs | FR-14 |

**`apps/api/test/routes/admin/licenses.test.ts`**

| Test | FR |
|---|---|
| Issues a new license with valid tier and dates → 201 | FR-15 |
| Rejects license issue with invalid tier → 400 | FR-15 |
| Rejects license issue with expiresAt before startsAt → 400 | FR-15 |
| Extends license with new expiresAt → 200 | FR-16 |
| Revokes license by setting status to cancelled → 200 | FR-17 |
| Rejects update with both expiresAt and status → 400 | PATCH validation |
| Rejects update with neither expiresAt nor status → 400 | PATCH validation |
| Returns 404 for non-existent license ID | PATCH validation |
| Creates audit log entry for license.issue | FR-25, FR-26 |
| Creates audit log entry for license.extend | FR-25, FR-26 |
| Creates audit log entry for license.revoke | FR-25, FR-26 |

**`apps/api/test/routes/admin/jobs.test.ts`**

| Test | FR |
|---|---|
| Returns paginated job list with default page size 50 | FR-18 |
| Filters jobs by status (single status) | FR-19 |
| Filters jobs by status (multiple comma-separated statuses) | FR-19 |
| Filters jobs by time range (7d, 30d, all) | FR-19 |
| Computes durationSec for terminal jobs | FR-18 |
| Returns durationSec null for non-terminal jobs | FR-18 |
| Returns rcCost null for non-complete jobs (including failed) | FR-18 |
| Returns full job detail with all fields | FR-20 |
| Returns SFN console URL derived from execution ARN | FR-20 |
| Returns sfnConsoleUrl null when sfnExecutionArn is null | FR-20 |
| Returns credit reservation with pack breakdown | FR-21 |
| Returns creditReservation null when no reservation exists | FR-21 |
| Returns 404 for non-existent job ID | FR-20 |

**`apps/api/test/routes/admin/credits.test.ts`**

| Test | FR |
|---|---|
| Grants credits (positive rcAmount) → creates credit pack with pack_name 'Admin Grant' | FR-22, FR-23 |
| Grant creates pack with price_gbp 0 and 12-month expiry | FR-23 |
| Grant creates pack with stripe_payment_intent_id null | FR-23 |
| Corrects credits (negative rcAmount) → depletes packs FIFO | FR-22, FR-24 |
| Rejects correction that exceeds available balance → 400 INSUFFICIENT_CREDITS | FR-24 |
| Rejects rcAmount of 0 → 400 | FR-22 |
| Rejects empty reason → 400 | FR-22 |
| Rejects reason exceeding 500 characters → 400 | FR-22 |
| Creates audit log entry for credits.grant | FR-25, FR-26 |
| Creates audit log entry for credits.correction | FR-25, FR-26 |
| Returns 404 for non-existent user ID | FR-22 |

**`apps/api/test/routes/admin/stats.test.ts`**

| Test | FR |
|---|---|
| Returns in-flight counts grouped by status | FR-9 |
| Returns completedToday count (since midnight UTC) | FR-9 |
| Returns failedToday count (since midnight UTC) | FR-9 |
| Returns 7-day failure rate as a percentage | FR-9 |
| Returns 0 failure rate when no terminal jobs in 7 days | FR-9 |
| Returns 10 most recent failed jobs | FR-9 |
| Returns empty recentFailedJobs when no failures exist | FR-9 |

**`apps/admin/test/hooks/useAdminAuth.test.ts`**

| Test | FR |
|---|---|
| Returns `isAdmin: true` when sessionClaims.publicMetadata.role is 'admin' | FR-4 |
| Returns `isAdmin: false` when sessionClaims.publicMetadata.role is not 'admin' | FR-4 |
| Returns `isAdmin: false` when user has no publicMetadata | FR-4 |

**`apps/admin/test/components/overview/MetricCard.test.tsx`**

| Test | FR |
|---|---|
| Renders label and value | FR-9 |
| Renders percentage suffix when provided | FR-9 |

**`apps/admin/test/components/users/CreditAdjustmentForm.test.tsx`**

| Test | FR |
|---|---|
| Submits positive amount as grant | FR-22 |
| Submits negative amount as correction | FR-22 |
| Disables submit when reason is empty | FR-22 |
| Disables submit when rcAmount is 0 | FR-22 |

**`apps/admin/test/components/users/IssueLicenseDialog.test.tsx`**

| Test | FR |
|---|---|
| Renders tier select with Plus and Pro options | FR-15 |
| Defaults startsAt to today | FR-15 |
| Defaults expiresAt to 1 year from today | FR-15 |
| Calls onSubmit with form values | FR-15 |

**`apps/admin/test/components/jobs/JobTable.test.tsx`**

| Test | FR |
|---|---|
| Renders job rows with correct columns | FR-18 |
| Shows '—' for rcCost on non-complete jobs (including failed) | FR-18 |
| Shows '—' for duration on non-terminal jobs | FR-18 |

**`apps/admin/test/components/jobs/JobStatusBadge.test.tsx`**

| Test | FR |
|---|---|
| Renders correct colour for each status | FR-18 |
| Renders correct label text for each status | FR-18 |

**`apps/admin/test/components/jobs/SfnExecutionLink.test.tsx`**

| Test | FR |
|---|---|
| Renders clickable link with correct AWS Console URL | FR-20 |
| Renders nothing when sfnExecutionArn is null | FR-20 |

**`apps/admin/test/pages/AccessDeniedPage.test.tsx`**

| Test | FR |
|---|---|
| Renders access denied message for non-admin users | FR-4 |

### Property-Based Tests

**`apps/api/test/properties/admin-auth.property.test.ts`**

Using `fast-check`:

1. **Admin role check is exhaustive:** For any arbitrary `publicMetadata` object (including missing `role`, `role` set to arbitrary strings, `role` set to arrays/numbers/objects), the admin middleware either returns `403` or passes through. It never throws an unhandled error or returns a 5xx.
2. **Pagination invariant:** For any valid `limit` (1..100) and any dataset size, the paginated response never returns more items than `limit`, and following `nextCursor` links eventually terminates (nextCursor becomes `null`).
3. **Credit grant idempotency on retry:** Given a grant request that fails after DB insert but before response, retrying the same request creates a second pack (no deduplication). This is acceptable because each grant is logged with a unique audit ID, and the admin can review and correct.
4. **Credit correction bound:** For any sequence of grants and corrections on the same user, the user's total RC remaining across all packs is always >= 0.

### Mutation / Genetic Modification Tests

The following mutations must be caught by the specification tests above. If a mutation survives, the test suite has a gap.

| Mutation | Target | Must be caught by |
|---|---|---|
| Remove admin role check in `admin-auth.ts` middleware | `plugins/admin-auth.ts` | `admin-auth.test.ts` — non-admin request must be rejected with 403 |
| Change 403 status to 200 in admin auth middleware | `plugins/admin-auth.ts` | `admin-auth.test.ts` — must assert exact 403 status code |
| Remove `limit` cap (allow limit > 100) | `routes/admin/users.ts` | `users.test.ts` — must verify limit is capped at 100 |
| Remove email search ILIKE filter | `routes/admin/users.ts` | `users.test.ts` — search filter test must fail |
| Skip audit log insert in license issue | `routes/admin/licenses.ts` | `licenses.test.ts` — audit log test must fail |
| Remove FIFO ordering in credit correction | `routes/admin/credits.ts` | `credits.test.ts` — must verify soonest-expiring pack is depleted first |
| Hardcode `failureRate7d` to 0 | `routes/admin/stats.ts` | `stats.test.ts` — must assert correct computed percentage |
| Return all jobs instead of filtering by status | `routes/admin/jobs.ts` | `jobs.test.ts` — status filter test must fail |
| Return all jobs instead of filtering by time range | `routes/admin/jobs.ts` | `jobs.test.ts` — time range filter test must fail |
| Remove `pack_name: 'Admin Grant'` from credit grant | `routes/admin/credits.ts` | `credits.test.ts` — must assert pack_name is 'Admin Grant' |
| Set `price_gbp` to non-zero in credit grant | `routes/admin/credits.ts` | `credits.test.ts` — must assert price_gbp is 0 |
| Remove transaction wrapping around write + audit log | `routes/admin/licenses.ts`, `credits.ts` | Transaction atomicity tests — audit log and primary mutation must succeed or fail together |
| Remove `expiresAt` / `status` mutual exclusion check | `routes/admin/licenses.ts` | `licenses.test.ts` — must reject requests with both fields |
| Remove credit balance check for negative corrections | `routes/admin/credits.ts` | `credits.test.ts` — must reject corrections exceeding balance |
| Omit `durationSec` computation for terminal jobs | `routes/admin/jobs.ts` | `jobs.test.ts` — must verify durationSec is computed for complete/failed |

### Characterisation Tests

Snapshot tests that lock down the shape of API responses and UI component output. These prevent accidental breaking changes.

**`apps/api/test/snapshots/admin-stats.snap.ts`**

```ts
// Snapshot: GET /api/admin/stats/overview response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "inFlight": {
      "uploading": Any<Number>,
      "queued": Any<Number>,
      "rendering": Any<Number>,
      "compositing": Any<Number>,
    },
    "completedToday": Any<Number>,
    "failedToday": Any<Number>,
    "failureRate7d": Any<Number>,
    "recentFailedJobs": Any<Array>,
  }
`)
```

**`apps/api/test/snapshots/admin-users.snap.ts`**

```ts
// Snapshot: GET /api/admin/users response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "users": [
      {
        "id": Any<String>,
        "clerkId": Any<String>,
        "email": Any<String>,
        "licenseTier": Any<String | null>,
        "createdAt": Any<String>,
      },
    ],
    "nextCursor": Any<String | null>,
  }
`)

// Snapshot: GET /api/admin/users/:id response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "user": {
      "id": Any<String>,
      "clerkId": Any<String>,
      "email": Any<String>,
      "billingCountry": Any<String | null>,
      "stripeCustomerId": Any<String | null>,
      "createdAt": Any<String>,
    },
    "licenses": Any<Array>,
    "creditPacks": Any<Array>,
    "recentJobs": Any<Array>,
  }
`)
```

**`apps/api/test/snapshots/admin-jobs.snap.ts`**

```ts
// Snapshot: GET /api/admin/jobs response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "jobs": [
      {
        "id": Any<String>,
        "userEmail": Any<String>,
        "status": Any<String>,
        "rcCost": Any<Number | null>,
        "createdAt": Any<String>,
        "updatedAt": Any<String>,
        "durationSec": Any<Number | null>,
        "errorMessage": Any<String | null>,
      },
    ],
    "nextCursor": Any<String | null>,
  }
`)

// Snapshot: GET /api/admin/jobs/:id response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "job": {
      "id": Any<String>,
      "userId": Any<String>,
      "userEmail": Any<String>,
      "status": Any<String>,
      "config": Any<Object>,
      "inputS3Keys": Any<Array>,
      "uploadIds": Any<Array>,
      "outputS3Key": Any<String | null>,
      "downloadExpiresAt": Any<String | null>,
      "slotTaskToken": Any<String | null>,
      "renderTaskToken": Any<String | null>,
      "remotionRenderId": Any<String | null>,
      "rcCost": Any<Number | null>,
      "sfnExecutionArn": Any<String | null>,
      "errorMessage": Any<String | null>,
      "createdAt": Any<String>,
      "updatedAt": Any<String>,
    },
    "sfnConsoleUrl": Any<String | null>,
    "creditReservation": Any<Object | null>,
  }
`)
```

**`apps/admin/test/snapshots/MetricCard.snap.tsx`**

```tsx
// Snapshot: MetricCard with count value
const { container } = render(<MetricCard label="Failed Today" value={3} />)
expect(container).toMatchInlineSnapshot()

// Snapshot: MetricCard with percentage value
const { container } = render(<MetricCard label="7d Failure Rate" value={4.2} suffix="%" />)
expect(container).toMatchInlineSnapshot()
```

**`apps/admin/test/snapshots/JobStatusBadge.snap.tsx`**

```tsx
// Snapshot: JobStatusBadge for each status
for (const status of ['uploading', 'queued', 'rendering', 'compositing', 'complete', 'failed'] as const) {
  const { container } = render(<JobStatusBadge status={status} />)
  expect(container).toMatchSnapshot(`JobStatusBadge-${status}`)
}
```
