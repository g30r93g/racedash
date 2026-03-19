# cloud-auth — Deferred Work

**Date:** 2026-03-19
**Status:** Deferred (post-launch)
**Related branch:** `feature/cloud-auth`

---

## Overview

These items are part of the `cloud-auth` spec scope but have been deferred to a follow-up pass after all 7 feature branches have landed. They do not block any downstream branch.

---

## Deferred Items

### 1. Wire `useAuth` into the component tree

**What:** The `useAuth()` hook exists but is not yet called from the top-level screens (`ProjectLibrary.tsx`, `Editor.tsx`). Auth state needs to be threaded down to `AccountDetails`, `AppSidebar`, and `ExportTab` as props.

**Why deferred:** The components accept the right props and the hook works — the wiring is straightforward React plumbing that can be done in a single pass once all UI changes from other branches (cloud-licensing credits section, cloud-rendering export tab changes) have landed. Doing it now risks merge conflicts with those branches.

**Impact if skipped:** The desktop app compiles and runs, but auth state won't flow to the UI — components will show their default/signed-out state regardless of session.

### 2. Implement 17 todo API tests

**What:** The following test files have `.todo` test cases that need mock infrastructure:

| File | Todo tests | Mocks needed |
|---|---|---|
| `clerk-auth.test.ts` | 6 | `@clerk/backend` `verifyToken()` |
| `auth.test.ts` | 5 | Clerk SDK + test DB |
| `webhooks.test.ts` | 6 | `svix` `Webhook.verify()` + test DB |

**Why deferred:** Requires setting up Clerk and Svix mock factories. The auth middleware and routes are implemented and manually testable. The 2 health route tests and the `cloud-db` test suite (57 tests) provide baseline coverage.

**Impact if skipped:** Auth middleware and webhook handler are untested at the unit level. Integration testing via the desktop app partially covers these paths.

---

## Not Deferred (completed)

The following items were initially considered for deferral but were completed because they block downstream branches:

- **`registerAuthHandlers` wired into Electron main** — required for all desktop auth IPC calls
- **Dual DB driver in `lib/db.ts`** — required for local API development with PostgreSQL
