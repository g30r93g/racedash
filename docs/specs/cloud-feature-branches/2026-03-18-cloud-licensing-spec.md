# feature/cloud-licensing — Branch Spec

**Date:** 2026-03-18
**Status:** Draft
**Branch:** `feature/cloud-licensing`
**Depends on:** `feature/cloud-auth` (which transitively depends on `feature/cloud-db`)

---

## Overview

This branch delivers Stripe subscription management, credit pack purchasing, license gating, and credit balance UI for RaceDash Cloud. On the API side it adds Stripe Checkout session creation (for both subscriptions and credit packs), a Stripe webhook handler for subscription lifecycle and credit purchase events, credit balance and purchase history endpoints, and a license retrieval endpoint. On the desktop side it adds an in-app Stripe Checkout flow via BrowserWindow, credit balance display with pack breakdown and expiry dates in the Account tab, feature gating that disables Pro-only features for Plus users, and hides the storage usage bar in the Cloud Renders tab (cloud storage sync is deferred to phase 2). No Stripe publishable key is needed in the desktop -- all Stripe interaction is server-initiated.

---

## Scope

### In scope

- `POST /api/stripe/checkout` -- create a Stripe Checkout session for subscription purchase
- `POST /api/stripe/credits/checkout` -- create a Stripe Checkout session for credit pack purchase
- `GET /api/credits/balance` -- return user's total credit balance with per-pack breakdown
- `GET /api/credits/history` -- return user's credit purchase history
- `GET /api/license` -- return user's current license
- `POST /api/webhooks/stripe` -- Stripe webhook handler for subscription and credit events
- Stripe Tax enabled on all Checkout sessions (`automatic_tax: { enabled: true }`)
- Electron BrowserWindow-based Stripe Checkout flow (opens hosted Checkout URL returned by the API)
- `AccountDetails.tsx` additions: credit balance display, pack breakdown with expiry, credit top-up button, subscription management link, credit purchase history
- `CloudRendersList.tsx`: hide the storage usage bar (cloud storage sync deferred to phase 2)
- `AppSidebar.tsx`: plan badge reflects actual license tier from API (building on cloud-auth's `'plus' | 'pro' | null`)
- Feature gating in desktop UI: Pro-only features disabled/prompted for Plus users
- Local license caching after API validation
- IPC additions for license, credits, and Stripe Checkout flows
- Preload script additions to expose new IPC channels

### Out of scope

- Cloud rendering pipeline and job management (owned by `cloud-rendering`)
- YouTube/social upload integration (owned by `cloud-youtube`)
- Admin dashboard and admin-granted credit packs (owned by `cloud-admin`)
- AWS infrastructure provisioning (owned by `cloud-infra`)
- Database schema, migrations, and credit helpers (`reserveCredits`, `releaseCredits`, `consumeCredits`) -- owned by `cloud-db`, consumed here
- Clerk authentication setup (owned by `cloud-auth`, consumed here)
- Cloud storage sync and the storage usage bar data source (deferred to phase 2)
- Stripe Customer Portal (can be added later; this branch uses Checkout only)

---

## Functional Requirements

1. **FR-1:** `POST /api/stripe/checkout` must create a Stripe Checkout session in `subscription` mode for the requested tier (`plus` or `pro`). It must return the hosted Checkout URL. If the user already has an active subscription, it must return `409 Conflict`.
2. **FR-2:** The Checkout session must set `automatic_tax: { enabled: true }` to enable Stripe Tax (automatic VAT/GST). The user's billing country from the `users` table must be passed as `customer_update.address: 'auto'` to allow Stripe to collect and update the billing address.
3. **FR-3:** If the authenticated user does not yet have a `stripe_customer_id` in the `users` table, the endpoint must create a Stripe Customer with the user's email, store the `stripe_customer_id` on the `users` row, and use it for the Checkout session.
4. **FR-4:** `POST /api/stripe/credits/checkout` must create a Stripe Checkout session in `payment` mode for a one-time credit pack purchase. It must accept `packSize` (the RC quantity) and return the hosted Checkout URL. The session metadata must include `user_id`, `pack_size`, and `type: 'credit_pack'` so the webhook can identify credit purchases.
5. **FR-5:** `GET /api/credits/balance` must return the user's total available RC balance (sum of `rc_remaining` across all non-expired packs) and an array of individual packs with their `id`, `packName`, `rcTotal`, `rcRemaining`, `purchasedAt`, and `expiresAt`.
6. **FR-6:** `GET /api/credits/history` must return a paginated list of the user's credit pack purchases, ordered by `purchased_at DESC`. Each entry includes `id`, `packName`, `rcTotal`, `priceGbp`, `purchasedAt`, and `expiresAt`. Pagination uses cursor-based paging with a `cursor` query parameter (pack ID) and a `limit` parameter (default 20, max 100).
7. **FR-7:** `GET /api/license` must return the user's active license (tier, status, subscription ID, renewal date) or `null` if no active license exists.
8. **FR-8:** `POST /api/webhooks/stripe` must verify the Stripe webhook signature using the `STRIPE_WEBHOOK_SECRET` before processing any event. Invalid signatures must return `400 Bad Request`. This route must be excluded from the Clerk auth middleware (it uses Stripe signature verification instead of Bearer tokens). This branch adds `/api/webhooks/stripe` to the middleware exclusion list alongside the existing `/api/health` and `/api/webhooks/clerk` exclusions defined by `cloud-auth`.
9. **FR-9:** The webhook handler must process `customer.subscription.created` by inserting a new row in the `licenses` table with the tier derived from the Stripe Price ID, `status: 'active'`, and the subscription period dates. The `stripe_customer_id` and `stripe_subscription_id` must be stored on the license row.
10. **FR-10:** The webhook handler must process `customer.subscription.updated` by updating the existing license row's `status`, `tier`, `starts_at`, `expires_at`, and `updated_at`. If the subscription status changes to `past_due` or `unpaid`, the license status must be set to `'expired'`.
11. **FR-11:** The webhook handler must process `customer.subscription.deleted` by setting the license row's status to `'cancelled'` and `updated_at` to the current timestamp.
12. **FR-12:** The webhook handler must process `checkout.session.completed` events where `metadata.type === 'credit_pack'` by inserting a new row in the `credit_packs` table with `rc_total` and `rc_remaining` set to the `metadata.pack_size`, `expires_at` set to 12 months from now, and `stripe_payment_intent_id` set from the session's payment intent.
13. **FR-13:** All webhook handlers must be idempotent. Processing the same event twice must not create duplicate rows or corrupt data. Idempotency is enforced using existing DB constraints rather than a separate event ID table: credit pack creation uses the `UNIQUE` constraint on `credit_packs.stripe_payment_intent_id` (duplicate inserts are caught and silently ignored); subscription creation uses `stripe_subscription_id` to check for existing license rows before inserting. No new tables or schema changes are needed.
14. **FR-14:** The desktop must open Stripe Checkout in a dedicated BrowserWindow when the user initiates a subscription or credit pack purchase. The main process calls the appropriate API endpoint to get the Checkout URL, then opens it in a BrowserWindow with `nodeIntegration: false` and `sandbox: true`.
15. **FR-15:** After Stripe Checkout completes (success or cancel), the BrowserWindow must detect the redirect to the success/cancel URL, close itself, and notify the renderer of the outcome.
16. **FR-16:** The `AccountDetails.tsx` component must display a "Credits" section showing the user's total RC balance, a breakdown of individual packs (name, remaining/total, expiry date), a "Top up credits" button that opens the credit pack Checkout flow, and a link to view purchase history.
17. **FR-17:** The `AccountDetails.tsx` component must display a "Purchase history" section (or navigable sub-view) showing past credit pack purchases with pack name, amount, price, and purchase date.
18. **FR-18:** The `CloudRendersList.tsx` storage usage bar (lines 72-88) must be removed or hidden. The storage bar has no data source in phase 1.
19. **FR-19:** Pro-only features must be disabled in the UI for Plus users. When a Plus user attempts a Pro-only action, a prompt must explain the feature requires Pro and offer an upgrade path (opens subscription Checkout). In phase 1, the Pro-only feature is concurrent render slots (Plus: 1, Pro: 3); the actual enforcement is in `cloud-rendering`, but the UI must display the limit.
20. **FR-20:** After successful license validation from the API, the license tier and expiry must be cached locally (in Electron's `safeStorage` alongside the auth session) to allow offline feature gating. The cache must be refreshed on each `GET /api/license` call and on app startup.
21. **FR-21:** The `AppSidebar` plan badge must reflect the actual license tier from the API. This is already structurally in place from `cloud-auth`; this branch ensures the data flows from `GET /api/license` through to the sidebar.

---

## Non-Functional Requirements

1. **NFR-1:** Stripe webhook handlers must be idempotent. Replaying the same event must produce the same final state. Event IDs must be tracked to detect duplicates.
2. **NFR-2:** The `POST /api/stripe/checkout` and `POST /api/stripe/credits/checkout` endpoints must respond within 2 seconds (Stripe Checkout session creation is fast, but network latency applies).
3. **NFR-3:** The Stripe webhook endpoint must return `200` quickly (within 5 seconds) to avoid Stripe retries. Heavy processing (if any) must be handled after acknowledging the webhook.
4. **NFR-4:** The Stripe Checkout BrowserWindow must not have access to Node.js APIs (`nodeIntegration: false`, `sandbox: true`).
5. **NFR-5:** No Stripe secret key or webhook secret may appear in the Electron renderer or preload bundles. All Stripe API calls are made server-side in `apps/api`.
6. **NFR-6:** Credit balance queries must be efficient. The partial index `credit_packs_user_fifo_idx` (defined in `cloud-db`) ensures fast lookups for non-depleted packs.
7. **NFR-7:** All new API endpoints must follow the error response conventions established by `cloud-auth` (see API Contracts section).
8. **NFR-8:** All exported functions and interfaces must have complete TypeScript type signatures (no `any` types).

---

## Package Structure

```
apps/api/src/
  routes/
    stripe.ts                         # POST /api/stripe/checkout
    stripe-credits.ts                 # POST /api/stripe/credits/checkout
    credits.ts                        # GET /api/credits/balance, GET /api/credits/history
    license.ts                        # GET /api/license
    webhooks-stripe.ts                # POST /api/webhooks/stripe
  lib/
    stripe.ts                         # Stripe SDK client singleton
    stripe-prices.ts                  # Price ID → tier mapping
    webhook-idempotency.ts            # Constraint-based idempotency helpers (upsert patterns)
  types.ts                            # (modified) add licensing + credit types

apps/api/test/
  routes/
    stripe.test.ts
    stripe-credits.test.ts
    credits.test.ts
    license.test.ts
    webhooks-stripe.test.ts
  properties/
    credits.property.test.ts
    webhooks.property.test.ts
  snapshots/
    credits-balance.snap.ts
    credits-history.snap.ts
    license.snap.ts
    stripe-checkout.snap.ts
    stripe-webhook.snap.ts

apps/desktop/src/
  main/
    stripe-checkout.ts                # BrowserWindow Stripe Checkout flow
    license-cache.ts                  # Local license caching with safeStorage
  preload/
    index.ts                          # (modified) expose licensing + credits IPC channels
  types/
    ipc.ts                            # (modified) add License*, Credit*, Stripe* types
  renderer/src/
    hooks/
      useLicense.ts                   # React hook for license state
      useCredits.ts                   # React hook for credit balance
    components/app/
      AccountDetails.tsx              # (modified) add credits section, purchase history
      CloudRendersList.tsx            # (modified) hide storage bar
      CreditBalance.tsx               # Credit balance + pack breakdown component
      CreditHistory.tsx               # Credit purchase history component
      FeatureGate.tsx                 # Pro-only feature gate wrapper component
      UpgradePrompt.tsx               # Upgrade to Pro prompt dialog
```

---

## API Endpoints

### `POST /api/stripe/checkout`

Creates a Stripe Checkout session for a subscription purchase.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Request | JSON body with `tier` |
| Response | `200 OK` |
| Errors | `401 Unauthorized`, `400 Bad Request`, `409 Conflict`, `502 Bad Gateway` |

**Request body:**

```json
{
  "tier": "pro"
}
```

**Response body:**

```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_xxx",
  "sessionId": "cs_xxx"
}
```

**Error cases:**

| Condition | Status | Code |
|---|---|---|
| Missing or invalid `tier` | `400` | `INVALID_TIER` |
| User already has active subscription | `409` | `SUBSCRIPTION_EXISTS` |
| Stripe API failure | `502` | `STRIPE_ERROR` |

---

### `POST /api/stripe/credits/checkout`

Creates a Stripe Checkout session for a one-time credit pack purchase.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Request | JSON body with `packSize` |
| Response | `200 OK` |
| Errors | `401 Unauthorized`, `400 Bad Request`, `403 Forbidden`, `502 Bad Gateway` |

**Request body:**

```json
{
  "packSize": 100
}
```

**Response body:**

```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_xxx",
  "sessionId": "cs_xxx"
}
```

**Error cases:**

| Condition | Status | Code |
|---|---|---|
| Missing or invalid `packSize` | `400` | `INVALID_PACK_SIZE` |
| User has no active license | `403` | `LICENSE_REQUIRED` |
| Stripe API failure | `502` | `STRIPE_ERROR` |

---

### `GET /api/credits/balance`

Returns the authenticated user's total credit balance and per-pack breakdown.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Response | `200 OK` |
| Errors | `401 Unauthorized` |

**Response body:**

```json
{
  "totalRc": 187,
  "packs": [
    {
      "id": "uuid-1",
      "packName": "100 RC Pack",
      "rcTotal": 100,
      "rcRemaining": 87,
      "purchasedAt": "2026-02-15T10:00:00.000Z",
      "expiresAt": "2027-02-15T10:00:00.000Z"
    },
    {
      "id": "uuid-2",
      "packName": "100 RC Pack",
      "rcTotal": 100,
      "rcRemaining": 100,
      "purchasedAt": "2026-03-10T14:00:00.000Z",
      "expiresAt": "2027-03-10T14:00:00.000Z"
    }
  ]
}
```

Only packs with `rc_remaining > 0` and `expires_at > now()` are included. Packs are ordered by `expires_at ASC` (soonest-expiring first, matching FIFO depletion order).

---

### `GET /api/credits/history`

Returns the authenticated user's credit pack purchase history.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Query params | `cursor` (optional, pack ID), `limit` (optional, default 20, max 100) |
| Response | `200 OK` |
| Errors | `401 Unauthorized` |

**Response body:**

```json
{
  "purchases": [
    {
      "id": "uuid-2",
      "packName": "100 RC Pack",
      "rcTotal": 100,
      "priceGbp": "9.99",
      "purchasedAt": "2026-03-10T14:00:00.000Z",
      "expiresAt": "2027-03-10T14:00:00.000Z"
    },
    {
      "id": "uuid-1",
      "packName": "100 RC Pack",
      "rcTotal": 100,
      "priceGbp": "9.99",
      "purchasedAt": "2026-02-15T10:00:00.000Z",
      "expiresAt": "2027-02-15T10:00:00.000Z"
    }
  ],
  "nextCursor": "uuid-0"
}
```

`nextCursor` is `null` when there are no more results. Purchases are ordered by `purchased_at DESC`.

---

### `GET /api/license`

Returns the authenticated user's current active license.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Response | `200 OK` |
| Errors | `401 Unauthorized` |

**Response body (active license):**

```json
{
  "license": {
    "tier": "pro",
    "status": "active",
    "stripeSubscriptionId": "sub_xxx",
    "startsAt": "2026-03-01T00:00:00.000Z",
    "expiresAt": "2027-03-01T00:00:00.000Z",
    "maxConcurrentRenders": 3
  }
}
```

**Response body (no active license):**

```json
{
  "license": null
}
```

The `maxConcurrentRenders` field is derived from the tier: Plus = 1, Pro = 3 (using `getSlotLimit` from `@racedash/db`).

---

### `POST /api/webhooks/stripe`

Stripe webhook handler. Verifies signature, then processes the event.

| Field | Value |
|---|---|
| Auth | Stripe webhook signature (not Bearer token) |
| Request | Raw body (Stripe event payload) |
| Response | `200 OK` |
| Errors | `400 Bad Request` (invalid signature) |

**Important:** This endpoint must receive the raw request body (not parsed JSON) for signature verification. Fastify must be configured to preserve the raw body for this route.

**Response body:**

```json
{
  "received": true
}
```

---

## Stripe Webhook Events

### `customer.subscription.created`

**Trigger:** User completes subscription Checkout.

**Action:**
1. Look up the user by `stripe_customer_id` in the `users` table.
2. Derive the tier from the Stripe Price ID (using the `stripe-prices.ts` mapping).
3. Insert a new row in the `licenses` table:
   - `user_id`: the DB user ID
   - `tier`: derived from Price ID
   - `stripe_customer_id`: from the subscription
   - `stripe_subscription_id`: from the subscription
   - `status`: `'active'`
   - `starts_at`: `subscription.current_period_start`
   - `expires_at`: `subscription.current_period_end`
4. If a license row already exists for this `stripe_subscription_id`, skip (idempotent).

### `customer.subscription.updated`

**Trigger:** Subscription renewal, upgrade/downgrade, or payment failure.

**Action:**
1. Find the license row by `stripe_subscription_id`.
2. Update:
   - `tier`: re-derive from the current Price ID (handles tier changes)
   - `status`: map Stripe subscription status (`active` -> `'active'`, `past_due`/`unpaid` -> `'expired'`, `canceled` -> `'cancelled'`)
   - `starts_at`: `subscription.current_period_start`
   - `expires_at`: `subscription.current_period_end`
   - `updated_at`: `now()`
3. If no license row found for this subscription, log a warning and skip.

### `customer.subscription.deleted`

**Trigger:** Subscription cancelled and period ended, or immediate cancellation.

**Action:**
1. Find the license row by `stripe_subscription_id`.
2. Set `status` to `'cancelled'` and `updated_at` to `now()`.
3. If no license row found, log a warning and skip (idempotent).

### `checkout.session.completed`

**Trigger:** One-time payment Checkout session completes.

**Action:**
1. Check `session.metadata.type === 'credit_pack'`. If not, ignore (other checkout types are not handled by this branch).
2. Look up the user by `stripe_customer_id` in the `users` table.
3. Extract `pack_size` from `session.metadata.pack_size`.
4. Insert a new row in the `credit_packs` table:
   - `user_id`: the DB user ID
   - `pack_name`: `"${pack_size} RC Pack"`
   - `rc_total`: `pack_size`
   - `rc_remaining`: `pack_size`
   - `price_gbp`: `session.amount_total / 100` (converted from pence)
   - `purchased_at`: `now()`
   - `expires_at`: `now() + 12 months`
   - `stripe_payment_intent_id`: `session.payment_intent`
5. If a credit pack row already exists with this `stripe_payment_intent_id`, skip (idempotent via UNIQUE constraint).

---

## Desktop Checkout Flow

### Subscription Purchase Sequence

```
1. User clicks "Manage subscription" or "Subscribe" in AccountDetails
2. Renderer calls window.racedash.stripe.createSubscriptionCheckout({ tier: 'pro' })
3. IPC handler in main process calls POST /api/stripe/checkout via fetchWithAuth
4. API creates Stripe Checkout session with:
   - mode: 'subscription'
   - customer: user's stripe_customer_id (created if needed)
   - line_items: [{ price: PRICE_ID_FOR_TIER, quantity: 1 }]
   - automatic_tax: { enabled: true }
   - success_url: 'https://racedash.com/checkout/success?session_id={CHECKOUT_SESSION_ID}'
   - cancel_url: 'https://racedash.com/checkout/cancel'
   - metadata: { user_id, tier }
5. API returns { checkoutUrl, sessionId }
6. Main process creates a new BrowserWindow:
   - nodeIntegration: false
   - sandbox: true
   - width: 600, height: 800
   - parent: main app window (modal)
   - title: 'RaceDash Cloud — Subscribe'
7. BrowserWindow navigates to the checkoutUrl (Stripe hosted Checkout page)
8. User completes payment on Stripe's hosted page
9. Stripe redirects to success_url or cancel_url
10. Main process detects navigation to success/cancel URL via 'will-navigate' or 'did-navigate'
11. Main process closes the Checkout BrowserWindow
12. On success: main process calls GET /api/license to fetch the new license
13. Main process updates the local license cache
14. Main process resolves the IPC response with the checkout result
15. Renderer updates license state via useLicense hook
```

### Credit Pack Purchase Sequence

```
1. User clicks "Top up credits" in AccountDetails
2. Renderer calls window.racedash.stripe.createCreditCheckout({ packSize: 100 })
3. IPC handler in main process calls POST /api/stripe/credits/checkout via fetchWithAuth
4. API creates Stripe Checkout session with:
   - mode: 'payment'
   - customer: user's stripe_customer_id
   - line_items: [{ price: CREDIT_PACK_PRICE_ID, quantity: 1 }]
   - automatic_tax: { enabled: true }
   - success_url: 'https://racedash.com/checkout/success?session_id={CHECKOUT_SESSION_ID}'
   - cancel_url: 'https://racedash.com/checkout/cancel'
   - metadata: { user_id, pack_size: '100', type: 'credit_pack' }
5. API returns { checkoutUrl, sessionId }
6. Main process creates a BrowserWindow (same config as subscription)
   - title: 'RaceDash Cloud — Purchase Credits'
7. BrowserWindow navigates to the checkoutUrl
8. User completes payment
9. Stripe redirects to success/cancel URL
10. Main process detects navigation, closes BrowserWindow
11. On success: main process calls GET /api/credits/balance to refresh balance
12. Main process resolves the IPC response
13. Renderer updates credit state via useCredits hook
```

---

## Desktop UI Changes

### `AccountDetails.tsx`

**File:** `apps/desktop/src/renderer/src/components/app/AccountDetails.tsx`

Current state (after `cloud-auth`): Shows real user data with name, email, subscription info, and sign-out button.

This branch adds the following sections below the existing Subscription section:

1. **Credits section** (new, between Subscription and Security):
   - `<SectionLabel>Credits</SectionLabel>`
   - Total RC balance displayed prominently (e.g., "187 RC")
   - Pack breakdown list: each pack shows name, remaining/total (e.g., "87 / 100 RC"), expiry date
   - Packs nearing expiry (< 30 days) are highlighted with a warning indicator
   - "Top up credits" button (`variant="outline"`, full width) opens credit pack Checkout
   - "Purchase history" link opens the purchase history view

2. **Purchase history** (new sub-view or expandable section):
   - List of past credit purchases
   - Each entry: pack name, RC amount, price (GBP), purchase date
   - Paginated (loads more on scroll or "Load more" button)

3. **Props update:**
   ```ts
   interface AccountDetailsProps {
     user: AuthUser | null
     license: AuthLicense | null
     creditBalance: CreditBalance | null
     onSignIn: () => void
     onSignOut: () => void
     onTopUpCredits: () => void
     onManageSubscription: () => void
     onSubscribe: (tier: 'plus' | 'pro') => void
   }
   ```

### `CloudRendersList.tsx`

**File:** `apps/desktop/src/renderer/src/components/app/CloudRendersList.tsx`

Remove the storage usage bar section (lines 72-88 in current code):

```tsx
// REMOVE this entire block:
{jobs[0] && (
  <>
    <Separator />
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Storage</span>
        <span className="text-foreground">
          {jobs[0].storageUsedGb}GB / {jobs[0].storageLimitGb}GB
        </span>
      </div>
      <Progress value={(jobs[0].storageUsedGb / jobs[0].storageLimitGb) * 100} />
      <button className="text-left text-xs text-primary hover:underline">
        Manage storage
      </button>
    </div>
  </>
)}
```

Also remove `storageUsedGb` and `storageLimitGb` from the `CloudRenderJob` interface (they have no data source in phase 1). The `Progress` import can be removed if no other usage remains.

### `AppSidebar.tsx`

**File:** `apps/desktop/src/renderer/src/components/app/AppSidebar.tsx`

The `cloud-auth` branch already changed `plan` to `'plus' | 'pro' | null`. This branch ensures the plan value is sourced from the `useLicense` hook (which calls `GET /api/license`) rather than being hardcoded or inferred from auth state alone. No structural changes needed -- just wiring.

### Feature Gating

A new `FeatureGate` wrapper component gates Pro-only UI:

```tsx
// apps/desktop/src/renderer/src/components/app/FeatureGate.tsx

interface FeatureGateProps {
  /** The minimum tier required to use this feature */
  requiredTier: 'pro'
  /** The user's current license tier, or null if unlicensed */
  currentTier: 'plus' | 'pro' | null
  /** Content to render when the feature is available */
  children: React.ReactNode
  /** Optional: custom fallback. Defaults to UpgradePrompt */
  fallback?: React.ReactNode
}
```

When `currentTier` does not meet `requiredTier`, the children are either hidden or rendered in a disabled/locked state, and an `UpgradePrompt` is shown.

The `UpgradePrompt` dialog:

```tsx
// apps/desktop/src/renderer/src/components/app/UpgradePrompt.tsx

interface UpgradePromptProps {
  feature: string        // e.g., "Up to 3 concurrent cloud renders"
  onUpgrade: () => void  // opens subscription Checkout for Pro
  onDismiss: () => void
}
```

In phase 1, the primary gated feature displayed in the UI is the concurrent render limit shown on the Cloud Renders tab or Export tab.

---

## IPC API Additions

New types added to `apps/desktop/src/types/ipc.ts`:

```ts
// ── License types ─────────────────────────────────────────────────────────

export interface LicenseInfo {
  tier: 'plus' | 'pro'
  status: 'active'
  stripeSubscriptionId: string
  startsAt: string   // ISO 8601
  expiresAt: string  // ISO 8601
  maxConcurrentRenders: number
}

// ── Credit types ──────────────────────────────────────────────────────────

export interface CreditPack {
  id: string
  packName: string
  rcTotal: number
  rcRemaining: number
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditBalance {
  totalRc: number
  packs: CreditPack[]
}

export interface CreditPurchase {
  id: string
  packName: string
  rcTotal: number
  priceGbp: string     // decimal string, e.g. "9.99"
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditHistory {
  purchases: CreditPurchase[]
  nextCursor: string | null
}

// ── Stripe Checkout types ─────────────────────────────────────────────────

export interface StripeCheckoutResult {
  outcome: 'success' | 'cancelled'
  sessionId: string
}
```

New methods on `RacedashAPI`:

```ts
export interface RacedashAPI {
  // ... existing methods ...

  // License
  license: {
    /** Get the user's current active license from the API. */
    get(): Promise<LicenseInfo | null>
    /** Get the locally cached license (for offline feature gating). */
    getCached(): Promise<LicenseInfo | null>
  }

  // Credits
  credits: {
    /** Get the user's credit balance and pack breakdown. */
    getBalance(): Promise<CreditBalance>
    /** Get the user's credit purchase history. */
    getHistory(cursor?: string): Promise<CreditHistory>
  }

  // Stripe Checkout
  stripe: {
    /** Open a Stripe Checkout BrowserWindow for subscription purchase. */
    createSubscriptionCheckout(opts: { tier: 'plus' | 'pro' }): Promise<StripeCheckoutResult>
    /** Open a Stripe Checkout BrowserWindow for credit pack purchase. */
    createCreditCheckout(opts: { packSize: number }): Promise<StripeCheckoutResult>
  }

  // License events — main → renderer push
  /** Fires when the license changes (new subscription, cancellation, etc.). */
  onLicenseChanged(cb: (license: LicenseInfo | null) => void): () => void
  /** Fires when the credit balance changes. */
  onCreditsChanged(cb: (balance: CreditBalance) => void): () => void
}
```

**IPC channels:**

| Channel | Direction | Purpose |
|---|---|---|
| `racedash:license:get` | renderer -> main | Fetch license from API |
| `racedash:license:getCached` | renderer -> main | Read locally cached license |
| `racedash:credits:getBalance` | renderer -> main | Fetch credit balance from API |
| `racedash:credits:getHistory` | renderer -> main | Fetch credit purchase history |
| `racedash:stripe:subscriptionCheckout` | renderer -> main | Initiate subscription Checkout |
| `racedash:stripe:creditCheckout` | renderer -> main | Initiate credit pack Checkout |
| `racedash:license:changed` | main -> renderer | License state changed event |
| `racedash:credits:changed` | main -> renderer | Credit balance changed event |

---

## Success Criteria

1. **SC-1:** A user with no subscription can click "Subscribe" in the Account tab, complete the Stripe Checkout flow in a BrowserWindow, and see their new license tier reflected in the Account tab and sidebar within 10 seconds of the webhook arriving.
2. **SC-2:** A user with an active license can purchase a credit pack via the "Top up credits" button, complete Stripe Checkout, and see the new credits reflected in their balance within 10 seconds of the webhook arriving.
3. **SC-3:** The `GET /api/credits/balance` endpoint returns the correct total RC and per-pack breakdown, excluding expired and fully depleted packs.
4. **SC-4:** The `GET /api/credits/history` endpoint returns paginated purchase history in reverse chronological order. Cursor-based pagination works correctly across multiple pages.
5. **SC-5:** The `GET /api/license` endpoint returns the correct license tier and status for authenticated users, or `null` for users without an active license.
6. **SC-6:** All four Stripe webhook events are handled correctly: `customer.subscription.created` creates a license, `customer.subscription.updated` updates it, `customer.subscription.deleted` cancels it, and `checkout.session.completed` creates a credit pack.
7. **SC-7:** Webhook handlers are idempotent: processing the same event twice does not create duplicate rows or corrupt data.
8. **SC-8:** The storage usage bar in `CloudRendersList.tsx` is not visible.
9. **SC-9:** Plus users see a prompt when attempting to access Pro-only features (e.g., the concurrent render limit is displayed as 1 for Plus, 3 for Pro).
10. **SC-10:** The Stripe Checkout BrowserWindow has `nodeIntegration: false` and `sandbox: true`, and no Stripe secret key is present in any Electron bundle.
11. **SC-11:** License tier is cached locally and the cached value is used for feature gating when offline.
12. **SC-12:** Stripe Tax is enabled on all Checkout sessions (`automatic_tax: { enabled: true }`).

---

## User Stories

1. **US-1 (End user -- new subscriber):** As a new RaceDash Cloud user, I want to subscribe to a Plus or Pro plan from within the desktop app so that I can access cloud features without leaving the app.
2. **US-2 (End user -- credit purchase):** As a subscriber, I want to purchase credit packs so that I can use cloud rendering and YouTube uploads.
3. **US-3 (End user -- credit balance):** As a subscriber, I want to see my total credit balance and a breakdown of my credit packs (with expiry dates) so that I know how many renders I can afford and when credits will expire.
4. **US-4 (End user -- purchase history):** As a subscriber, I want to review my past credit purchases so that I can track my spending.
5. **US-5 (End user -- feature gating):** As a Plus subscriber, I want to understand which features require Pro so that I can decide whether to upgrade.
6. **US-6 (End user -- offline access):** As a user with intermittent internet, I want the app to remember my license tier so that feature gating works even when I am offline.
7. **US-7 (Downstream -- cloud-rendering):** As the `cloud-rendering` branch developer, I need the license and credit balance IPC methods so that I can enforce credit checks and slot limits before submitting render jobs.
8. **US-8 (Downstream -- cloud-youtube):** As the `cloud-youtube` branch developer, I need the credit balance IPC methods so that I can check the user has at least 10 RC before initiating a YouTube upload.

---

## UI Mocks to Produce

The following Paper mockups should be created before implementation begins. All placeholder names must use "G. Gorzynski" with "GG" initials.

1. **Account tab -- Credits section (Pro user with packs):** Shows "187 RC" total, two packs with remaining/total and expiry, "Top up credits" button, "Purchase history" link. User: G. Gorzynski, PRO badge.
2. **Account tab -- Credits section (empty balance):** Shows "0 RC" with a prompt to purchase credits and "Top up credits" button.
3. **Account tab -- Credits section (pack expiring soon):** Shows a pack with < 30 days remaining, highlighted with a warning indicator.
4. **Account tab -- Purchase history view:** List of past purchases showing pack name, RC amount, price in GBP, purchase date. Shows G. Gorzynski header.
5. **Account tab -- Full view (Plus user):** Shows PLUS badge, subscription info, credits section, security section, sign-out button.
6. **Account tab -- No license state:** User is authenticated but has no subscription. Shows "Get RaceDash Cloud" upsell with tier comparison and subscribe buttons.
7. **Stripe Checkout BrowserWindow -- Subscribe:** 600x800 modal window titled "RaceDash Cloud -- Subscribe" showing Stripe's hosted Checkout page.
8. **Stripe Checkout BrowserWindow -- Credit purchase:** 600x800 modal window titled "RaceDash Cloud -- Purchase Credits" showing Stripe's hosted Checkout page.
9. **Feature gate prompt -- Plus user:** Dialog explaining "This feature requires RaceDash Cloud Pro" with an "Upgrade to Pro" button and dismiss option.
10. **Cloud Renders tab -- no storage bar:** Verify the storage usage bar is not visible at the bottom of the Cloud Renders tab.

---

## Happy Paths

### HP-1: Subscribe to Pro

1. User opens the Account tab (signed in, no active subscription).
2. UI shows "Get RaceDash Cloud" with tier options.
3. User clicks "Subscribe to Pro".
4. Renderer calls `window.racedash.stripe.createSubscriptionCheckout({ tier: 'pro' })`.
5. Main process calls `POST /api/stripe/checkout` with `{ tier: 'pro' }`.
6. API creates Stripe Customer (if needed), creates Checkout session, returns URL.
7. BrowserWindow opens showing Stripe's hosted Checkout page.
8. User enters payment details and completes checkout.
9. Stripe redirects to success URL; BrowserWindow closes.
10. Stripe fires `customer.subscription.created` webhook.
11. API creates license row with `tier: 'pro'`, `status: 'active'`.
12. Main process calls `GET /api/license` to fetch the new license.
13. Account tab updates: shows "PRO" badge, subscription details.
14. Sidebar footer updates to show "RaceDash Cloud PRO".

### HP-2: Purchase Credit Pack

1. User is signed in with an active Pro subscription.
2. User navigates to Account tab, sees Credits section showing current balance.
3. User clicks "Top up credits".
4. Renderer calls `window.racedash.stripe.createCreditCheckout({ packSize: 100 })`.
5. Main process calls `POST /api/stripe/credits/checkout` with `{ packSize: 100 }`.
6. API creates Checkout session in `payment` mode, returns URL.
7. BrowserWindow opens showing Stripe Checkout page.
8. User completes payment.
9. BrowserWindow closes on success redirect.
10. Stripe fires `checkout.session.completed` webhook.
11. API creates credit pack row with `rc_total: 100`, `rc_remaining: 100`, `expires_at: now + 12 months`.
12. Main process calls `GET /api/credits/balance` to refresh.
13. Account tab updates: new pack appears in breakdown, total balance increases.

### HP-3: View Credit Balance

1. User navigates to Account tab.
2. `useCredits` hook calls `window.racedash.credits.getBalance()`.
3. Main process calls `GET /api/credits/balance`.
4. API queries `credit_packs` for non-expired packs with `rc_remaining > 0`.
5. Response includes total RC and per-pack breakdown.
6. `CreditBalance` component renders total prominently, pack list with expiry dates.

### HP-4: View Purchase History

1. User clicks "Purchase history" link in the Credits section.
2. Renderer calls `window.racedash.credits.getHistory()`.
3. Main process calls `GET /api/credits/history`.
4. API queries `credit_packs` ordered by `purchased_at DESC`, limit 20.
5. `CreditHistory` component renders the list.
6. User scrolls to bottom; "Load more" button calls `getHistory(nextCursor)` for next page.

### HP-5: Feature Gating (Plus User)

1. Plus user views the Cloud Renders tab.
2. UI displays concurrent render limit as "1 of 1 render slots".
3. User sees a locked indicator or tooltip explaining "Upgrade to Pro for up to 3 concurrent renders".
4. User clicks the upgrade prompt.
5. `UpgradePrompt` dialog opens with feature description and "Upgrade to Pro" button.
6. User clicks "Upgrade to Pro", which triggers the subscription Checkout flow for Pro tier.

---

## Security Considerations

1. **Webhook signature verification:** The `POST /api/webhooks/stripe` endpoint must verify the Stripe webhook signature using `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` before processing any event. Requests with invalid signatures must return `400`.
2. **Raw body requirement:** Stripe signature verification requires the raw (unparsed) request body. The Fastify route must be configured to preserve the raw body (e.g., using `addContentTypeParser` for `application/json` that stores the raw buffer).
3. **No Stripe keys in renderer:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are only used in `apps/api`. No Stripe publishable key is needed in the desktop at all -- all Checkout sessions are created server-side and the desktop simply opens the hosted URL.
4. **Checkout BrowserWindow isolation:** The Stripe Checkout BrowserWindow uses `nodeIntegration: false`, `sandbox: true`, and a dedicated session partition. It cannot access the main app window's cookies, storage, or Node.js APIs.
5. **Idempotent webhook handling:** Webhook handlers use constraint-based idempotency (UNIQUE constraints on `credit_packs.stripe_payment_intent_id` and `licenses.stripe_subscription_id`) to prevent duplicate processing. Duplicate inserts are caught via `ON CONFLICT DO NOTHING` or pre-insert checks. This guards against Stripe's at-least-once delivery guarantee.
6. **Price ID validation:** The API must validate that the Stripe Price ID in subscription checkout requests maps to a known tier. Unknown Price IDs must be rejected to prevent users from subscribing to unauthorized products.
7. **Metadata integrity:** Credit pack webhook handlers must validate that `metadata.type`, `metadata.user_id`, and `metadata.pack_size` are present and valid before creating credit pack rows.
8. **No client-side amount manipulation:** Credit pack prices are determined server-side by the Stripe Price ID. The `packSize` from the client selects a pre-configured Stripe Price; the actual charge amount is controlled by Stripe's price configuration, not by client input.
9. **IPC URL allowlisting:** The Stripe Checkout BrowserWindow URLs are constructed server-side (Stripe hosted Checkout) and the success/cancel URLs are hardcoded constants. The main process must validate that navigation stays within expected domains (Stripe and the configured success/cancel host).

---

## Infrastructure

This branch does not own any infrastructure. Stripe is an external SaaS. The API endpoints run on `cloud-infra`'s Lambda. Locally, the API is run via Fastify's built-in dev server (`pnpm dev` in `apps/api`).

**Environment variables consumed by this branch:**

| Variable | Runtime | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | `apps/api` (Lambda) | Stripe secret key for creating Checkout sessions and verifying webhooks |
| `STRIPE_WEBHOOK_SECRET` | `apps/api` (Lambda) | Stripe webhook signing secret |
| `DATABASE_URL` | `apps/api` (Lambda) | Neon pooled connection string (already set by `cloud-auth`) |
| `VITE_API_URL` | `apps/desktop` (Electron renderer) | Lambda Function URL base (already set by `cloud-auth`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | `apps/desktop` (Electron renderer) | Clerk publishable key (already set by `cloud-auth`, not used by this branch directly) |

---

## API Contracts

### Shared types (`apps/api/src/types.ts` -- additions)

```ts
// ── Stripe Checkout ───────────────────────────────────────────────────────

export interface CreateSubscriptionCheckoutRequest {
  tier: 'plus' | 'pro'
}

export interface CreateCreditCheckoutRequest {
  packSize: number
}

export interface CheckoutResponse {
  checkoutUrl: string
  sessionId: string
}

// ── Credits ───────────────────────────────────────────────────────────────

export interface CreditPackResponse {
  id: string
  packName: string
  rcTotal: number
  rcRemaining: number
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditBalanceResponse {
  totalRc: number
  packs: CreditPackResponse[]
}

export interface CreditPurchaseResponse {
  id: string
  packName: string
  rcTotal: number
  priceGbp: string     // decimal string
  purchasedAt: string  // ISO 8601
  expiresAt: string    // ISO 8601
}

export interface CreditHistoryResponse {
  purchases: CreditPurchaseResponse[]
  nextCursor: string | null
}

// ── License ───────────────────────────────────────────────────────────────

export interface LicenseResponse {
  license: LicenseDetail | null
}

export interface LicenseDetail {
  tier: 'plus' | 'pro'
  status: 'active'
  stripeSubscriptionId: string
  startsAt: string           // ISO 8601
  expiresAt: string          // ISO 8601
  maxConcurrentRenders: number
}

// ── Stripe Webhook ────────────────────────────────────────────────────────

export interface StripeWebhookResponse {
  received: true
}
```

### Stripe Price ID mapping (`apps/api/src/lib/stripe-prices.ts`)

```ts
/** Maps Stripe Price IDs to license tiers. */
export const STRIPE_PRICE_TO_TIER: Record<string, 'plus' | 'pro'> = {
  // Values set from environment or config; these are placeholder IDs
  'price_plus_annual': 'plus',
  'price_pro_annual': 'pro',
}

/** Maps pack sizes to Stripe Price IDs for credit packs. */
export const CREDIT_PACK_PRICES: Record<number, string> = {
  50: 'price_credits_50',
  100: 'price_credits_100',
  250: 'price_credits_250',
  500: 'price_credits_500',
}

export function tierFromPriceId(priceId: string): 'plus' | 'pro' | null {
  return STRIPE_PRICE_TO_TIER[priceId] ?? null
}

export function priceIdForPack(packSize: number): string | null {
  return CREDIT_PACK_PRICES[packSize] ?? null
}
```

### Error codes (additions to `cloud-auth`'s error codes)

| HTTP Status | `error.code` | When |
|---|---|---|
| `400` | `INVALID_TIER` | `tier` is not `'plus'` or `'pro'` in checkout request |
| `400` | `INVALID_PACK_SIZE` | `packSize` is not a valid credit pack size |
| `400` | `INVALID_WEBHOOK_SIGNATURE` | Stripe webhook signature verification failed |
| `403` | `LICENSE_REQUIRED` | Credit purchase attempted without active license |
| `409` | `SUBSCRIPTION_EXISTS` | User already has an active subscription |
| `502` | `STRIPE_ERROR` | Stripe API returned an error |

---

## Tests

### Specification Tests

Unit tests using Vitest. Each test targets a specific functional requirement.

**`apps/api/test/routes/stripe.test.ts`**

| Test | FR |
|---|---|
| Creates Stripe Checkout session for `plus` tier and returns checkout URL | FR-1 |
| Creates Stripe Checkout session for `pro` tier and returns checkout URL | FR-1 |
| Sets `automatic_tax: { enabled: true }` on the Checkout session | FR-2 |
| Creates Stripe Customer when user has no `stripe_customer_id` | FR-3 |
| Reuses existing `stripe_customer_id` when already set | FR-3 |
| Returns `400` for invalid tier value | FR-1 |
| Returns `409` when user already has active subscription | FR-1 |
| Returns `401` when not authenticated | FR-1 |

**`apps/api/test/routes/stripe-credits.test.ts`**

| Test | FR |
|---|---|
| Creates Checkout session in `payment` mode for valid pack size | FR-4 |
| Includes `type: 'credit_pack'` and `pack_size` in session metadata | FR-4 |
| Sets `automatic_tax: { enabled: true }` | FR-2 |
| Returns `400` for invalid pack size | FR-4 |
| Returns `403` when user has no active license | FR-4 |
| Returns `401` when not authenticated | FR-4 |

**`apps/api/test/routes/credits.test.ts`**

| Test | FR |
|---|---|
| Returns total RC balance summing all non-expired packs with remaining credits | FR-5 |
| Excludes expired packs from balance | FR-5 |
| Excludes fully depleted packs (rc_remaining = 0) from balance | FR-5 |
| Orders packs by `expires_at ASC` (FIFO order) | FR-5 |
| Returns empty packs array and totalRc 0 when user has no packs | FR-5 |
| Returns paginated purchase history in `purchased_at DESC` order | FR-6 |
| Respects cursor-based pagination | FR-6 |
| Respects limit parameter (default 20, max 100) | FR-6 |
| Returns `nextCursor: null` on last page | FR-6 |
| Returns `401` when not authenticated | FR-5, FR-6 |

**`apps/api/test/routes/license.test.ts`**

| Test | FR |
|---|---|
| Returns active license with tier, status, subscription ID, dates, and max concurrent renders | FR-7 |
| Returns `maxConcurrentRenders: 1` for Plus tier | FR-7 |
| Returns `maxConcurrentRenders: 3` for Pro tier | FR-7 |
| Returns `{ license: null }` when user has no active license | FR-7 |
| Returns `{ license: null }` when license is expired | FR-7 |
| Returns `{ license: null }` when license is cancelled | FR-7 |
| Returns `401` when not authenticated | FR-7 |

**`apps/api/test/routes/webhooks-stripe.test.ts`**

| Test | FR |
|---|---|
| Returns `400` for missing Stripe signature header | FR-8 |
| Returns `400` for invalid Stripe signature | FR-8 |
| Creates license row on `customer.subscription.created` | FR-9 |
| Derives correct tier from Stripe Price ID | FR-9 |
| Sets license status to `'active'` on creation | FR-9 |
| Stores `stripe_customer_id` and `stripe_subscription_id` on license | FR-9 |
| Updates license tier/status/dates on `customer.subscription.updated` | FR-10 |
| Maps `past_due` subscription status to `'expired'` license status | FR-10 |
| Sets license status to `'cancelled'` on `customer.subscription.deleted` | FR-11 |
| Creates credit pack on `checkout.session.completed` with `metadata.type === 'credit_pack'` | FR-12 |
| Sets credit pack `expires_at` to 12 months from purchase | FR-12 |
| Sets `rc_total` and `rc_remaining` to `metadata.pack_size` | FR-12 |
| Ignores `checkout.session.completed` without `metadata.type === 'credit_pack'` | FR-12 |
| Skips duplicate events (idempotent via DB constraints) | FR-13 |
| Skips duplicate subscription creation (idempotent by subscription ID) | FR-13 |
| Skips duplicate credit pack (idempotent by `stripe_payment_intent_id` UNIQUE) | FR-13 |
| Returns `{ received: true }` for all successfully processed events | FR-8 |

### Property-Based Tests

Using `fast-check`.

**`apps/api/test/properties/credits.property.test.ts`**

1. **Balance is non-negative:** For any sequence of credit pack insertions (arbitrary `rc_total` > 0) and balance queries, `totalRc` is always >= 0.
2. **Balance equals sum of remainders:** For any set of packs, `totalRc` equals the sum of `rcRemaining` across all non-expired packs.
3. **Pack ordering is stable:** For any set of packs with distinct `expires_at` values, the `packs` array in the balance response is always sorted by `expires_at ASC`.
4. **History pagination is complete:** For any set of N purchases, paginating through the full history with any valid `limit` (1-100) yields exactly N unique entries.
5. **Expired packs excluded:** For any pack where `expires_at < now()`, it must not appear in the balance response packs array.

**`apps/api/test/properties/webhooks.property.test.ts`**

1. **Webhook idempotency:** For any Stripe event replayed K times (K drawn from 1-10), the resulting database state is identical to processing it once. Specifically: exactly one license row per subscription ID, exactly one credit pack row per payment intent ID.
2. **Subscription lifecycle consistency:** For any sequence of `created`, `updated`, `deleted` events for the same subscription ID, the final license status is deterministic: if the last event is `deleted`, status is `'cancelled'`; if the last event is `updated` with `status: 'active'`, status is `'active'`.
3. **Unknown events are safe:** For any event with a type not in the handled set, the webhook returns `200` and makes no database changes.

### Mutation / Genetic Modification Tests

The following mutations must be caught by the specification tests above. If a mutation survives, the test suite has a gap.

| Mutation | Target | Must be caught by |
|---|---|---|
| Remove `stripe.webhooks.constructEvent()` call | `routes/webhooks-stripe.ts` | `webhooks-stripe.test.ts` -- invalid signature test must fail (webhook would accept unsigned payloads) |
| Return hardcoded `tier: 'pro'` instead of deriving from Price ID | `routes/webhooks-stripe.ts` | `webhooks-stripe.test.ts` -- Plus subscription test must fail |
| Remove `automatic_tax` from Checkout session params | `routes/stripe.ts` | `stripe.test.ts` -- tax assertion must fail |
| Remove expired-pack filter from balance query | `routes/credits.ts` | `credits.test.ts` -- expired pack test must fail (expired pack would appear in balance) |
| Change pack ordering from `ASC` to `DESC` in balance query | `routes/credits.ts` | `credits.test.ts` -- pack ordering test must fail |
| Remove `409` check for existing subscription | `routes/stripe.ts` | `stripe.test.ts` -- duplicate subscription test must fail |
| Remove `403` check for license requirement on credit purchase | `routes/stripe-credits.ts` | `stripe-credits.test.ts` -- no-license test must fail |
| Remove constraint-based idempotency checks in webhook handler | `routes/webhooks-stripe.ts` | `webhooks-stripe.test.ts` -- duplicate event test must fail |
| Change `maxConcurrentRenders` to always return 3 | `routes/license.ts` | `license.test.ts` -- Plus tier must assert `maxConcurrentRenders: 1` |
| Remove `metadata.type` check in `checkout.session.completed` handler | `routes/webhooks-stripe.ts` | `webhooks-stripe.test.ts` -- non-credit checkout must not create a pack |
| Set credit pack `expires_at` to 6 months instead of 12 | `routes/webhooks-stripe.ts` | `webhooks-stripe.test.ts` -- expiry date assertion must fail |
| Remove `nodeIntegration: false` from Checkout BrowserWindow | `main/stripe-checkout.ts` | Desktop integration test must verify window options |
| Store `STRIPE_SECRET_KEY` in renderer-accessible location | build config | Security audit / bundle analysis must detect Stripe key in renderer bundle |

### Characterisation Tests

Snapshot tests that lock down the shape of API responses.

**`apps/api/test/snapshots/credits-balance.snap.ts`**

```ts
// Snapshot: GET /api/credits/balance response shape (user with packs)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "totalRc": Any<Number>,
    "packs": [
      {
        "id": Any<String>,
        "packName": Any<String>,
        "rcTotal": Any<Number>,
        "rcRemaining": Any<Number>,
        "purchasedAt": Any<String>,
        "expiresAt": Any<String>,
      },
    ],
  }
`)

// Snapshot: GET /api/credits/balance response shape (no packs)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "totalRc": 0,
    "packs": [],
  }
`)
```

**`apps/api/test/snapshots/credits-history.snap.ts`**

```ts
// Snapshot: GET /api/credits/history response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "purchases": [
      {
        "id": Any<String>,
        "packName": Any<String>,
        "rcTotal": Any<Number>,
        "priceGbp": Any<String>,
        "purchasedAt": Any<String>,
        "expiresAt": Any<String>,
      },
    ],
    "nextCursor": Any<String | null>,
  }
`)
```

**`apps/api/test/snapshots/license.snap.ts`**

```ts
// Snapshot: GET /api/license response shape (active Pro license)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "license": {
      "tier": "pro",
      "status": "active",
      "stripeSubscriptionId": Any<String>,
      "startsAt": Any<String>,
      "expiresAt": Any<String>,
      "maxConcurrentRenders": 3,
    },
  }
`)

// Snapshot: GET /api/license response shape (active Plus license)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "license": {
      "tier": "plus",
      "status": "active",
      "stripeSubscriptionId": Any<String>,
      "startsAt": Any<String>,
      "expiresAt": Any<String>,
      "maxConcurrentRenders": 1,
    },
  }
`)

// Snapshot: GET /api/license response shape (no license)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "license": null,
  }
`)
```

**`apps/api/test/snapshots/stripe-checkout.snap.ts`**

```ts
// Snapshot: POST /api/stripe/checkout response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "checkoutUrl": Any<String>,
    "sessionId": Any<String>,
  }
`)

// Snapshot: POST /api/stripe/checkout error (subscription exists)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "error": {
      "code": "SUBSCRIPTION_EXISTS",
      "message": Any<String>,
    },
  }
`)
```

**`apps/api/test/snapshots/stripe-webhook.snap.ts`**

```ts
// Snapshot: POST /api/webhooks/stripe success response
expect(response.json()).toMatchInlineSnapshot(`
  {
    "received": true,
  }
`)

// Snapshot: POST /api/webhooks/stripe error (invalid signature)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "error": {
      "code": "INVALID_WEBHOOK_SIGNATURE",
      "message": Any<String>,
    },
  }
`)
```
