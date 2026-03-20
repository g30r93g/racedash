# feature/cloud-admin — Deferred Tasks

**Date:** 2026-03-20
**Branch:** `feat/cloud-admin`
**Status:** To be completed after the main body of epic/cloud work is done

These tasks are non-blocking polish, spec compliance refinements, and test coverage. The admin dashboard is fully functional (all pages, API endpoints, auth, audit logging) without them.

---

## 1. CORS Configuration

Add `@fastify/cors` to `apps/api` and register with `ADMIN_APP_ORIGIN` env var. Required for production deployment but not needed during development (same-origin proxy handles it).

**Files:** `apps/api/src/app.ts`, `apps/api/package.json`, `apps/api/.env.example`

---

## 2. shadcn/ui Component Migration

Replace hand-written HTML dialogs, buttons, tables, and inputs with shadcn/ui primitives (`Button`, `Card`, `Table`, `Dialog`, `Input`, `Select`, `Badge`). FR-1 specifies shadcn/ui. The current implementation is functionally equivalent but uses plain HTML elements.

**Files:** `apps/admin/components/ui/`, all dialog and table components

---

## 3. Zod Validation Schemas

Replace manual `if`-based validation in admin API routes with Zod schemas. Security Consideration 4 specifies Zod. Current validation is correct but not schema-driven.

**Files:** `apps/api/src/routes/admin/licenses.ts`, `credits.ts`, `users.ts`, `stats.ts`

---

## 4. Multi-Select Job Status Filter

FR-19 requires multi-select status filtering. Current UI is single-select `<select>`. The API already supports comma-separated statuses. Replace with a multi-select component.

**Files:** `apps/admin/app/jobs/page.tsx`

---

## 5. Shared Hooks (`useAdminAuth`, `useApiMutation`)

Extract common patterns from dialog components into `hooks/useAdminAuth.ts` (client-side role check) and `hooks/useApiMutation.ts` (shared POST/PATCH wrapper with error handling). Reduces duplication across `IssueLicenseDialog`, `ExtendLicenseDialog`, `RevokeLicenseDialog`, and `CreditAdjustmentForm`.

**Files:** `apps/admin/hooks/useAdminAuth.ts`, `apps/admin/hooks/useApiMutation.ts`

---

## 6. Dialog Error Handling

`IssueLicenseDialog`, `ExtendLicenseDialog`, and `RevokeLicenseDialog` silently swallow API errors. Add error state display matching the pattern in `CreditAdjustmentForm`.

**Files:** `apps/admin/components/users/IssueLicenseDialog.tsx`, `ExtendLicenseDialog.tsx`, `RevokeLicenseDialog.tsx`

---

## 7. Rate Limiting

Security Consideration 5 requires admin endpoints to be rate-limited to 100 req/min per admin user. Add a Fastify rate-limiting plugin scoped to the admin route prefix.

**Files:** `apps/api/src/routes/admin/index.ts`, `apps/api/package.json`

---

## 8. Specification Tests

Write all spec tests listed in the spec's Tests section:

- `apps/api/test/plugins/admin-auth.test.ts` (4 tests)
- `apps/api/test/routes/admin/users.test.ts` (8 tests)
- `apps/api/test/routes/admin/licenses.test.ts` (11 tests)
- `apps/api/test/routes/admin/jobs.test.ts` (13 tests)
- `apps/api/test/routes/admin/credits.test.ts` (11 tests)
- `apps/api/test/routes/admin/stats.test.ts` (7 tests)
- `apps/admin/test/hooks/useAdminAuth.test.ts` (3 tests)
- `apps/admin/test/components/overview/MetricCard.test.tsx` (2 tests)
- `apps/admin/test/components/users/CreditAdjustmentForm.test.tsx` (4 tests)
- `apps/admin/test/components/users/IssueLicenseDialog.test.tsx` (4 tests)
- `apps/admin/test/components/jobs/JobTable.test.tsx` (3 tests)
- `apps/admin/test/components/jobs/JobStatusBadge.test.tsx` (2 tests)
- `apps/admin/test/components/jobs/SfnExecutionLink.test.tsx` (2 tests)
- `apps/admin/test/pages/AccessDeniedPage.test.tsx` (1 test)

---

## 9. Property-Based Tests

Write property-based tests using `fast-check`:

- Admin role check exhaustiveness
- Pagination invariant (nextCursor terminates)
- Credit correction bound (RC never negative)

**File:** `apps/api/test/properties/admin-auth.property.test.ts`

---

## 10. Snapshot / Characterisation Tests

Write snapshot tests for API response shapes and component rendering:

- `apps/api/test/snapshots/admin-stats.snap.ts`
- `apps/api/test/snapshots/admin-users.snap.ts`
- `apps/api/test/snapshots/admin-jobs.snap.ts`
- `apps/admin/test/snapshots/MetricCard.snap.tsx`
- `apps/admin/test/snapshots/JobStatusBadge.snap.tsx`

---

## 11. `logAdminAction` Transaction Type Safety

The `logAdminAction` helper accepts `DrizzleDb` but is called with `tx as any` inside transactions. Update the type signature to accept both the top-level client and transaction proxy, removing the need for `as any` casts.

**Files:** `packages/db/src/helpers/audit.ts`, all call sites in `licenses.ts`, `credits.ts`

---

## 12. UI Mocks in Paper

Create the 11 Paper mockups listed in the spec's "UI Mocks to Produce" section, using "G. Gorzynski" / "GG" as placeholder names.
