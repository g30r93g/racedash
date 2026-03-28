# cloud-licensing — Deferred Work

**Date:** 2026-03-19
**Status:** Deferred until epic body of work is complete
**Branch:** `feature/cloud-licensing`

---

## Items

### 1. Remove `as any` casts on error reply sends

13 instances across route files where `reply.send({ error: ... } as any)` bypasses the Fastify `Reply` generic. Fix by unioning `Reply` with `ApiError` on each route handler generic. Pre-existing pattern from `cloud-auth`; violates NFR-8 but low runtime risk.

**Files:** `routes/stripe.ts`, `routes/stripe-credits.ts`, `routes/credits.ts`, `routes/license.ts`, `routes/webhooks-stripe.ts`

### 2. Add FastifyRequest module augmentation for `rawBody`

`(request as any).rawBody` is used without a `declare module 'fastify' { interface FastifyRequest { rawBody?: string } }` extension. The Clerk auth plugin already demonstrates the correct pattern for augmenting `FastifyRequest`. Add the augmentation and remove the `as any` accesses.

**Files:** `routes/webhooks-stripe.ts`, `app.ts`

### 3. Pack size selection UI

`handleTopUpCredits` in `ProjectLibrary.tsx` hardcodes `packSize: 100`. The API supports 50, 100, 250, and 500. Add a pack size picker (dropdown or button group) before opening checkout. Low risk since credit purchases work end-to-end; this is a UX gap.

**Files:** `ProjectLibrary.tsx`, `AccountDetails.tsx`, `CreditBalance.tsx`

### 4. Stripe Customer Portal for subscription management

The "Manage subscription" button in `AccountDetails.tsx` is currently disabled with "Coming soon". Integrate Stripe Customer Portal (`stripe.billingPortal.sessions.create`) to allow users to update payment methods, cancel, or change plans.

**Files:** `routes/stripe.ts` (new endpoint), `stripe-checkout.ts` (new IPC handler), `AccountDetails.tsx`

### 5. Deduplicate `racedash:license:get` push event

The `racedash:license:get` IPC handler both returns the license and unconditionally fires `racedash:license:changed`, causing a redundant re-render in `useLicense` on mount. The push event should only fire on out-of-band changes (post-checkout success, webhook arrival), not on explicit fetches.

**Files:** `stripe-checkout.ts`

### 6. Paper UI mocks

The spec lists 10 mockups to produce. None have been created. These are design artifacts for documentation and do not block code.

### 7. Wire `FeatureGate` to real gated features

The `FeatureGate` and `UpgradePrompt` components exist but are not used anywhere in the current UI. `cloud-rendering` will use them for concurrent render slot limits. No action needed until that branch lands; listed here for completeness.
