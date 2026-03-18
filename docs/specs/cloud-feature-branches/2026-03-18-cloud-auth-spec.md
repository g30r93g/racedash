# feature/cloud-auth — Branch Spec

**Date:** 2026-03-18
**Status:** Draft
**Branch:** `feature/cloud-auth`
**Depends on:** `feature/cloud-db`

---

## Overview

This branch delivers two major pieces: the `apps/api` Fastify scaffold (deployed as an AWS Lambda behind a Lambda Function URL) and end-to-end Clerk authentication across the desktop Electron app and the API. It includes Clerk auth middleware on all protected API routes, a BrowserWindow-based OAuth sign-in flow in Electron, secure session token persistence, token injection into API requests, a Clerk webhook handler for automatic user provisioning, real user data in the Account tab, and the plan tier rename from `'free' | 'pro'` to `'plus' | 'pro'`. After this branch lands, all downstream branches (`cloud-admin`, `cloud-licensing`, `cloud-rendering`, `cloud-youtube`) can build on the authenticated API scaffold.

---

## Scope

### In scope

- `apps/api` Fastify application scaffold with `@fastify/aws-lambda` adapter for Lambda Function URL deployment
- Clerk auth middleware plugin for Fastify (validates session JWT on all protected routes)
- `GET /api/auth/me` endpoint returning authenticated user profile + license tier
- `POST /api/webhooks/clerk` endpoint for Clerk webhook events (`user.created` provisioning)
- `GET /api/health` unauthenticated health check endpoint
- Standardised API error handling conventions (error response shape, HTTP status codes)
- Electron BrowserWindow-based OAuth flow (opens Clerk hosted sign-in page, captures token on redirect)
- Session token persistence in Electron secure storage (`safeStorage`)
- Token injection into all API requests from the renderer process (via IPC to main process)
- New IPC methods on `window.racedash.*` for auth operations
- `AccountDetails.tsx` wired to real Clerk user data and license tier from the API
- `AppSidebar.tsx` plan prop type changed from `'free' | 'pro'` to `'plus' | 'pro'` with visual handling for both tiers
- `ExportTab.tsx` footer "Sign in" button wired to the Clerk OAuth flow
- Sign-out button enabled and wired to Electron session clear + Clerk sign-out
- Preload script additions to expose new auth IPC channels

### Out of scope

- Stripe integration and webhook handling (owned by `cloud-licensing`)
- Credit system and credit pack management (owned by `cloud-db` + `cloud-licensing`)
- Cloud rendering pipeline and job management (owned by `cloud-rendering`)
- Admin dashboard UI and API routes (owned by `cloud-admin`; depends on this branch for the API scaffold)
- YouTube/social upload integration (owned by `cloud-youtube`)
- AWS infrastructure provisioning — Lambda, Function URL, IAM (owned by `cloud-infra`)
- Database schema and migrations (owned by `cloud-db`; consumed here as `@racedash/db`)
- Clerk account/organisation management UI (Clerk's hosted pages handle this)
- Password change flow (Clerk hosted UI handles this; the existing button in `AccountDetails` already links out)

---

## Functional Requirements

1. **FR-1:** `apps/api` must be a Fastify application that exports a Lambda handler via `@fastify/aws-lambda`. The Lambda Function URL is the sole HTTP entry point (no API Gateway).
2. **FR-2:** The API must register a Clerk auth middleware plugin that validates the `Authorization: Bearer <session_token>` header on all routes except `/api/health` and `/api/webhooks/clerk`. Invalid or missing tokens must return `401 Unauthorized`.
3. **FR-3:** `GET /api/auth/me` must return the authenticated user's profile (name, email, avatar URL) and their active license tier (`'plus'` or `'pro'`) or `null` if no active license. Profile fields (name, avatar URL) are sourced from the Clerk session claims (not the DB — the `users` table does not store name or avatar). License tier is queried from the `licenses` table in `@racedash/db`.
4. **FR-4:** `POST /api/webhooks/clerk` must verify the Clerk webhook signature using the `svix` library, then handle the `user.created` event by inserting a new row into the `users` table with the Clerk user ID and email. Unknown event types must be acknowledged with `200` and ignored.
5. **FR-5:** `GET /api/health` must return `{ status: 'ok' }` with no authentication required. This endpoint is used by infrastructure health checks.
6. **FR-6:** The Electron main process must open a BrowserWindow pointing to Clerk's hosted sign-in URL when the user initiates sign-in. The window must use a dedicated session partition (`persist:clerk-auth`) to isolate cookies from the main app window.
7. **FR-7:** After successful Clerk authentication, the OAuth BrowserWindow must detect the redirect to the configured callback URL, extract the session token, store it in Electron's `safeStorage`, and close the OAuth window.
8. **FR-8:** The stored session token must be automatically injected as an `Authorization: Bearer` header into all API requests made from the renderer process. The renderer calls IPC to the main process, which attaches the token before forwarding the request.
9. **FR-9:** `window.racedash.auth.signIn()` must open the OAuth BrowserWindow and return a `Promise<AuthSession>` that resolves when authentication completes or rejects if the user closes the window.
10. **FR-10:** `window.racedash.auth.signOut()` must clear the session token from `safeStorage`, call Clerk's sign-out endpoint to invalidate the server-side session, and notify the renderer that the user is signed out.
11. **FR-11:** `window.racedash.auth.getSession()` must return the current `AuthSession` (user profile + token) from `safeStorage` if one exists, or `null` if no session is stored. This is called on app startup to restore the session.
12. **FR-12:** `window.racedash.auth.fetchWithAuth(url, init?)` must perform an HTTP request with the stored session token injected as the `Authorization` header. This is the canonical way for the renderer to call the API.
13. **FR-13:** The `AppSidebar` component's `user.plan` prop type must change from `'free' | 'pro'` to `'plus' | 'pro'`. The sidebar footer must display "RaceDash Cloud PLUS" for Plus users and "RaceDash Cloud PRO" for Pro users. When no active license exists, no plan label is shown.
14. **FR-14:** `AccountDetails.tsx` must accept user data as props (no longer hardcoded) and display the authenticated user's name, email, initials in the avatar, license tier badge, and subscription renewal date. When no user is signed in, it must show a sign-in prompt.
15. **FR-15:** The sign-out button in `AccountDetails.tsx` must have its `disabled` attribute removed and be wired to call `window.racedash.auth.signOut()`, then reset the UI to the signed-out state.
16. **FR-16:** The "Sign in" button in `ExportTab.tsx` footer must be wired to call `window.racedash.auth.signIn()`. After sign-in, the footer must update to show the user's name. (Sign-out is available in the Account tab — the ExportTab footer does not need a separate sign-out action.)
17. **FR-17:** The Clerk webhook handler must verify the `svix-id`, `svix-timestamp`, and `svix-signature` headers before processing any event. Requests with invalid signatures must return `400 Bad Request`.

---

## Non-Functional Requirements

1. **NFR-1:** Clerk session tokens (JWTs) have a short lifetime (typically 60 seconds). The Electron auth module must handle automatic token refresh using Clerk's `getToken()` mechanism before tokens expire, so the user never sees an auth error during normal usage.
2. **NFR-2:** Session tokens must be encrypted at rest using Electron's `safeStorage` API, which delegates to the OS keychain (macOS Keychain, Windows DPAPI, Linux Secret Service).
3. **NFR-3:** The API cold-start latency (Lambda init + Fastify ready) must remain under 500ms. The Clerk SDK and `@racedash/db` client must use lazy initialization where possible.
4. **NFR-4:** The API must return structured JSON error responses following a consistent shape (see API Contracts section) for all 4xx and 5xx responses.
5. **NFR-5:** The OAuth BrowserWindow must not have access to Node.js APIs (`nodeIntegration: false`, `sandbox: true`) and must not share the main window's session.
6. **NFR-6:** All API responses must include appropriate `Cache-Control` headers. `/api/auth/me` must be `no-store` (user-specific data).
7. **NFR-7:** The `apps/api` package must compile with `tsc` and produce CommonJS output consistent with the monorepo's `tsconfig.base.json`.
8. **NFR-8:** All exported functions and interfaces must have complete TypeScript type signatures (no `any` types).

---

## Package Structure

```
apps/api/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                          # Fastify app creation + Lambda handler export
    app.ts                            # Fastify app factory (createApp)
    plugins/
      clerk-auth.ts                   # Clerk auth middleware plugin
      error-handler.ts                # Standardised error handling plugin
    routes/
      auth.ts                         # GET /api/auth/me
      webhooks.ts                     # POST /api/webhooks/clerk
      health.ts                       # GET /api/health
    lib/
      clerk.ts                        # Clerk SDK client singleton
      db.ts                           # @racedash/db client singleton
    types.ts                          # API-specific types (request/response shapes)
  test/
    plugins/
      clerk-auth.test.ts
    routes/
      auth.test.ts
      webhooks.test.ts
      health.test.ts
    properties/
      auth.property.test.ts
    snapshots/
      auth-me.snap.ts
      webhook-response.snap.ts

apps/desktop/src/
  main/
    auth.ts                           # BrowserWindow OAuth flow + safeStorage
    api-client.ts                     # Authenticated HTTP client (token injection)
  preload/
    index.ts                          # (modified) expose auth IPC channels
  types/
    ipc.ts                            # (modified) add Auth* types
  renderer/src/
    hooks/
      useAuth.ts                      # React hook for auth state
    components/app/
      AppSidebar.tsx                  # (modified) plan type update
      AccountDetails.tsx              # (modified) real user data
    screens/editor/tabs/
      ExportTab.tsx                   # (modified) sign-in button wired
```

---

## API Endpoints

### `GET /api/health`

Unauthenticated health check.

| Field | Value |
|---|---|
| Auth | None |
| Response | `200 OK` |

```json
{
  "status": "ok"
}
```

### `GET /api/auth/me`

Returns the authenticated user's profile and active license tier. `name` and `avatarUrl` are sourced from Clerk session claims; `id`, `clerkId`, `email`, `createdAt` from the `users` DB table; `license` from the `licenses` DB table.

| Field | Value |
|---|---|
| Auth | `Authorization: Bearer <session_token>` |
| Response | `200 OK` |
| Errors | `401 Unauthorized` |

**Response body:**

```json
{
  "user": {
    "id": "uuid",
    "clerkId": "user_xxx",
    "email": "george@university.ac.uk",
    "name": "G. Gorzynski",
    "avatarUrl": "https://img.clerk.com/...",
    "createdAt": "2026-03-18T00:00:00.000Z"
  },
  "license": {
    "tier": "pro",
    "status": "active",
    "expiresAt": "2026-04-01T00:00:00.000Z"
  }
}
```

When the user has no active license, `license` is `null`.

### `POST /api/webhooks/clerk`

Clerk webhook receiver. Verifies the Svix signature, then processes the event.

| Field | Value |
|---|---|
| Auth | Svix signature headers (not Bearer token) |
| Request | Clerk webhook event payload |
| Response | `200 OK` |
| Errors | `400 Bad Request` (invalid signature) |

**Required headers:**

- `svix-id`
- `svix-timestamp`
- `svix-signature`

**Handled events:**

| Event | Action |
|---|---|
| `user.created` | Insert new row into `users` table with `clerk_id` and `email` |
| Any other event | Acknowledge with `200`, no action |

**Response body:**

```json
{
  "received": true
}
```

---

## Electron Auth Flow

### Sign-in Sequence

```
1. User clicks "Sign in" (ExportTab footer or AccountDetails prompt)
2. Renderer calls window.racedash.auth.signIn()
3. Main process IPC handler receives 'racedash:auth:signIn'
4. Main process creates a new BrowserWindow:
   - partition: 'persist:clerk-auth'
   - nodeIntegration: false
   - sandbox: true
   - width: 500, height: 700
   - parent: main app window (modal)
   - title: 'Sign in to RaceDash Cloud'
5. BrowserWindow navigates to Clerk hosted sign-in URL:
   https://accounts.racedash.com/sign-in?redirect_url=racedash://auth/callback
6. User completes sign-in on Clerk's hosted page
7. Clerk redirects to racedash://auth/callback#session_token=<jwt>
8. Main process intercepts the redirect via protocol handler or will-navigate
9. Main process extracts the session token from the URL
10. Main process calls `GET /api/auth/me` with the session token to get the user profile + license tier (profile data comes from Clerk session claims server-side; no `CLERK_SECRET_KEY` needed in Electron)
11. Main process encrypts token + user profile with safeStorage.encryptString()
12. Main process stores encrypted blob in app config dir
13. Main process closes the OAuth BrowserWindow
14. Main process resolves the IPC response with AuthSession
15. Renderer receives AuthSession and updates React state via useAuth hook
```

### Token Refresh Sequence

```
1. Before each API request, main process checks token expiry (JWT exp claim)
2. If token expires within 10 seconds, main process re-opens a hidden
   BrowserWindow to Clerk's token endpoint to obtain a fresh session token
   (Clerk's JS SDK handles refresh via the hosted session — no secret key needed)
3. New token is stored in safeStorage, replacing the old one
4. Request proceeds with the fresh token
5. If refresh fails (e.g., session revoked), main process clears stored session
   and notifies renderer via IPC event 'racedash:auth:sessionExpired'
```

### Sign-out Sequence

```
1. User clicks "Sign out" in AccountDetails
2. Renderer calls window.racedash.auth.signOut()
3. Main process IPC handler receives 'racedash:auth:signOut'
4. Main process deletes the encrypted session from safeStorage / config dir (session revocation is not performed client-side — the short-lived JWT expires naturally; server-side revocation can be added later if needed)
5. Main process clears the 'persist:clerk-auth' session cookies
6. Main process resolves the IPC response with void
7. Renderer clears auth state via useAuth hook → UI shows signed-out state
```

---

## Desktop UI Changes

### `AppSidebar.tsx`

**File:** `apps/desktop/src/renderer/src/components/app/AppSidebar.tsx`

1. Change `plan` type in `AppSidebarProps`:
   ```ts
   // Before
   plan: 'free' | 'pro'
   // After
   plan: 'plus' | 'pro' | null
   ```

2. Update the sidebar footer to handle both tiers:
   ```tsx
   // Before (line 74-76)
   {user.plan === 'pro' && (
     <p className="text-[10px] text-blue-400">RaceDash Cloud PRO</p>
   )}

   // After
   {user.plan === 'pro' && (
     <p className="text-[10px] text-blue-400">RaceDash Cloud PRO</p>
   )}
   {user.plan === 'plus' && (
     <p className="text-[10px] text-emerald-400">RaceDash Cloud PLUS</p>
   )}
   ```

3. When `plan` is `null` (no active license / signed out), no plan label is displayed.

### `AccountDetails.tsx`

**File:** `apps/desktop/src/renderer/src/components/app/AccountDetails.tsx`

1. Add props interface:
   ```ts
   interface AccountDetailsProps {
     user: AuthUser | null
     license: AuthLicense | null
     onSignIn: () => void
     onSignOut: () => void
   }
   ```

2. **Signed-in state:** Display real data from props:
   - Avatar: initials derived from `user.name`
   - Name: `user.name`
   - Badge: `license.tier` uppercased (`"PRO"` or `"PLUS"`)
   - Email: `user.email`
   - Subscription plan: `"RaceDash Cloud Pro"` or `"RaceDash Cloud Plus"`
   - Renewal date: formatted from `license.expiresAt`
   - Sign-out button: `disabled` attribute removed, `onClick` calls `onSignOut`

3. **Signed-out state:** When `user` is `null`, display:
   - Prompt text: "Sign in to access RaceDash Cloud"
   - Sign-in button calling `onSignIn`

4. **No license state:** When `user` is present but `license` is `null`, display user info with no subscription section and a "Get RaceDash Cloud" upsell link.

### `ExportTab.tsx` footer

**File:** `apps/desktop/src/renderer/src/screens/editor/tabs/ExportTab.tsx`

1. The existing stub footer (currently at the bottom of the component) must be updated:
   ```tsx
   // Before
   <Button variant="ghost" size="sm" disabled>Sign in</Button>

   // After — signed out
   <Button variant="ghost" size="sm" onClick={() => window.racedash.auth.signIn()}>
     Sign in
   </Button>

   // After — signed in
   <span className="text-xs text-foreground">{user.name}</span>
   ```

2. Note: The stub footer is not currently rendered in the `ExportTab` return JSX (it exists as a comment block). This branch must add it to the rendered output, wired to auth state.

---

## IPC API Additions

New methods added to the `RacedashAPI` interface in `apps/desktop/src/types/ipc.ts`:

```ts
// ── Auth types ────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string
}

export interface AuthLicense {
  tier: 'plus' | 'pro'
  status: 'active'   // only active licenses are returned; expired/cancelled → license is null
  expiresAt: string
}

export interface AuthSession {
  user: AuthUser
  license: AuthLicense | null
  token: string
}

export interface FetchWithAuthOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface FetchWithAuthResponse {
  status: number
  headers: Record<string, string>
  body: string
}
```

New methods on `RacedashAPI`:

```ts
export interface RacedashAPI {
  // ... existing methods ...

  // Auth
  auth: {
    /** Open Clerk OAuth window, return session on success. */
    signIn(): Promise<AuthSession>
    /** Clear local session and notify renderer. */
    signOut(): Promise<void>
    /** Restore session from secure storage, or null if none. */
    getSession(): Promise<AuthSession | null>
    /** Make an authenticated HTTP request to the API. */
    fetchWithAuth(url: string, init?: FetchWithAuthOptions): Promise<FetchWithAuthResponse>
  }

  // Auth events — main → renderer push
  /** Fires when session expires or token refresh fails. */
  onAuthSessionExpired(cb: () => void): () => void
}
```

**IPC channels:**

| Channel | Direction | Purpose |
|---|---|---|
| `racedash:auth:signIn` | renderer -> main | Initiate OAuth flow |
| `racedash:auth:signOut` | renderer -> main | Sign out and clear session |
| `racedash:auth:getSession` | renderer -> main | Restore session from storage |
| `racedash:auth:fetchWithAuth` | renderer -> main | Authenticated HTTP request |
| `racedash:auth:sessionExpired` | main -> renderer | Session expired or refresh failed event |

---

## Success Criteria

1. **SC-1:** A user can click "Sign in" in the ExportTab footer or Account tab, complete the Clerk OAuth flow in the popup window, and see their real name and email in the Account tab within 3 seconds of the redirect.
2. **SC-2:** After signing in and restarting the app, the user's session is automatically restored from secure storage without requiring re-authentication (until the Clerk session itself expires).
3. **SC-3:** Clicking "Sign out" in the Account tab clears the local session (token, cookies, cached profile) and returns the UI to the signed-out state.
4. **SC-4:** The `GET /api/auth/me` endpoint returns the correct user profile and license tier when called with a valid session token, and returns `401` for invalid or missing tokens.
5. **SC-5:** The `POST /api/webhooks/clerk` endpoint correctly creates a `users` row when receiving a `user.created` event with a valid Svix signature, and rejects requests with invalid signatures (returning `400`).
6. **SC-6:** The `GET /api/health` endpoint returns `{ status: 'ok' }` without authentication.
7. **SC-7:** `AppSidebar` correctly displays "RaceDash Cloud PLUS" in emerald text for Plus users and "RaceDash Cloud PRO" in blue text for Pro users.
8. **SC-8:** The sign-out button in `AccountDetails` is no longer disabled and triggers the full sign-out flow when clicked.
9. **SC-9:** Token refresh happens transparently before token expiry. The user never encounters a `401` during normal usage with an active Clerk session.
10. **SC-10:** The `apps/api` package can be built with `pnpm build` and the Lambda handler can be invoked locally via the Fastify dev server.

---

## User Stories

1. **US-1 (End user — first sign-in):** As a new RaceDash Cloud subscriber, I want to sign in to my account from the desktop app so that my cloud renders and subscription are linked to my account.
2. **US-2 (End user — session persistence):** As a returning user, I want the app to remember my session between launches so that I do not have to sign in every time I open RaceDash.
3. **US-3 (End user — sign out):** As a user who shares a computer, I want to sign out of my account so that the next person cannot access my cloud features.
4. **US-4 (End user — account info):** As a subscriber, I want to see my name, email, and subscription tier in the Account tab so that I can confirm my account details.
5. **US-5 (End user — export sign-in):** As a user who tries to use cloud rendering from the Export tab, I want a convenient "Sign in" button right there so that I do not have to navigate to the Account tab first.
6. **US-6 (Downstream branch — cloud-admin):** As the `cloud-admin` branch developer, I need the `apps/api` Fastify scaffold and Clerk auth middleware to exist so that I can add admin routes and admin-role checks on top of them.
7. **US-7 (Downstream branch — cloud-licensing):** As the `cloud-licensing` branch developer, I need the authenticated `fetchWithAuth` IPC method so that I can make Stripe checkout API calls from the renderer.
8. **US-8 (Downstream branch — cloud-rendering):** As the `cloud-rendering` branch developer, I need the API scaffold and auth middleware so that I can add job submission and status endpoints.

---

## UI Mocks to Produce

The following Paper mockups should be created before implementation begins. All placeholder names must use "G. Gorzynski" with "GG" initials.

1. **Account tab — signed in (Pro):** Shows real user data, "PRO" badge, subscription details, enabled sign-out button.
2. **Account tab — signed in (Plus):** Shows real user data, "PLUS" badge, subscription details, enabled sign-out button.
3. **Account tab — signed out:** Shows sign-in prompt with "Sign in to access RaceDash Cloud" message and sign-in button.
4. **Account tab — no license:** Shows user info but no subscription section; shows "Get RaceDash Cloud" upsell link.
5. **AppSidebar footer — Plus tier:** Shows "RaceDash Cloud PLUS" in emerald text below user name.
6. **AppSidebar footer — Pro tier:** Shows "RaceDash Cloud PRO" in blue text below user name (existing, verify unchanged).
7. **AppSidebar footer — no license:** Shows user name only, no plan label.
8. **OAuth BrowserWindow:** Clerk hosted sign-in page in a 500x700 modal window titled "Sign in to RaceDash Cloud".
9. **ExportTab footer — signed out:** "Sign in" button enabled (no longer disabled).
10. **ExportTab footer — signed in:** Shows user name instead of "Sign in" button.

---

## Happy Paths

### HP-1: First-time sign-in

1. User opens RaceDash Desktop for the first time (no stored session).
2. UI shows signed-out state: Account tab shows sign-in prompt, ExportTab footer shows enabled "Sign in" button.
3. User clicks "Sign in" in the ExportTab footer.
4. OAuth BrowserWindow opens showing Clerk's sign-in page.
5. User enters credentials and completes sign-in.
6. OAuth window closes automatically.
7. ExportTab footer updates to show user's name.
8. Account tab updates to show full profile with subscription details.
9. AppSidebar footer shows plan tier label.

### HP-2: Returning user (session restore)

1. User reopens RaceDash after a previous sign-in.
2. On app startup, `useAuth` hook calls `window.racedash.auth.getSession()`.
3. Main process reads encrypted session from disk, decrypts with `safeStorage`.
4. Session is returned to renderer; UI immediately shows signed-in state.
5. Main process proactively refreshes the token if near expiry.

### HP-3: Sign-out

1. User navigates to the Account tab.
2. User clicks the "Sign out" button (red, destructive variant).
3. Main process clears `safeStorage` token and session cookies (local-only; JWT expires naturally).
4. UI transitions to signed-out state across all components.

### HP-4: Token refresh

1. User has been using the app for a while; the current JWT is approaching its 60-second expiry.
2. Before the next API request, main process detects the token will expire within 10 seconds.
3. Main process calls Clerk's refresh mechanism to obtain a new JWT.
4. New JWT is stored in `safeStorage`.
5. API request proceeds with the fresh token. User notices nothing.

### HP-5: Webhook — new user provisioning

1. A new user signs up via Clerk (on web or in the desktop app).
2. Clerk sends a `user.created` webhook to `POST /api/webhooks/clerk`.
3. API verifies the Svix signature.
4. API inserts a new row in the `users` table with the Clerk user ID and email.
5. API responds `200 { "received": true }`.
6. When the user subsequently calls `GET /api/auth/me`, their profile (name, avatar) is returned from the Clerk session claims, and their license tier is queried from the DB.

---

## Security Considerations

1. **Token storage:** Session tokens are encrypted using Electron's `safeStorage` API, which delegates to the OS-native credential store. Tokens are never stored in plain text on disk or in `localStorage`.
2. **OAuth window isolation:** The OAuth BrowserWindow uses a separate session partition (`persist:clerk-auth`), `nodeIntegration: false`, and `sandbox: true`. It cannot access the main app's cookies, storage, or Node.js APIs.
3. **Redirect URL validation:** The main process must validate that the OAuth redirect URL matches the expected `racedash://auth/callback` scheme before extracting the token. Redirects to unexpected URLs must be rejected.
4. **Webhook signature verification:** The `POST /api/webhooks/clerk` endpoint must verify the `svix-id`, `svix-timestamp`, and `svix-signature` headers using the `svix` library and the Clerk webhook signing secret. Requests with invalid or missing signatures must be rejected with `400`.
5. **Replay attack prevention:** The Svix verification includes a timestamp tolerance check (default 5 minutes). The API must not disable or extend this tolerance.
6. **CSRF protection:** The OAuth flow uses the `racedash://` custom protocol for the redirect, which cannot be triggered from a web page. The Clerk-issued `state` parameter provides additional CSRF protection.
7. **Token scope:** Clerk session JWTs are short-lived (60 seconds) and audience-scoped. Even if intercepted, they expire quickly.
8. **No secrets in renderer:** The Clerk publishable key (`VITE_CLERK_PUBLISHABLE_KEY`) is safe to embed in renderer code. The secret key (`CLERK_SECRET_KEY`) is only used server-side in `apps/api` for JWT verification and Clerk webhook processing. It must never appear in the Electron main process or renderer bundle. Token refresh in the desktop is handled via a hidden BrowserWindow that loads Clerk's hosted session page (which uses the publishable key, not the secret key).
9. **IPC security:** The `fetchWithAuth` IPC handler in the main process must validate the target URL against an allowlist (the API base URL) to prevent the renderer from using it as a general-purpose authenticated proxy.

---

## Infrastructure

This branch does not own any infrastructure. The Lambda function, Function URL, and associated IAM roles are provisioned by `feature/cloud-infra`. Locally, the API is run via Fastify's built-in dev server (`pnpm dev` in `apps/api`).

**Environment variables consumed:**

| Variable | Runtime | Description |
|---|---|---|
| `CLERK_SECRET_KEY` | `apps/api` (Lambda) | Clerk secret key for JWT verification and webhook processing |
| `CLERK_WEBHOOK_SECRET` | `apps/api` (Lambda) | Svix signing secret for webhook verification |
| `DATABASE_URL` | `apps/api` (Lambda) | Neon pooled connection string |
| `VITE_API_URL` | `apps/desktop` (Electron renderer) | Lambda Function URL base (e.g., `https://xxx.lambda-url.eu-west-2.on.aws`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | `apps/desktop` (Electron renderer) | Clerk publishable key for OAuth flow |

---

## API Contracts

### Shared types (`apps/api/src/types.ts`)

```ts
// ── Error response ────────────────────────────────────────────────────────

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

// ── GET /api/health ───────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok'
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────

export interface AuthMeUser {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: string // ISO 8601
}

export interface AuthMeLicense {
  tier: 'plus' | 'pro'
  status: 'active'   // only active licenses are returned; expired/cancelled → license is null
  expiresAt: string // ISO 8601
}

export interface AuthMeResponse {
  user: AuthMeUser
  license: AuthMeLicense | null
}

// ── POST /api/webhooks/clerk ──────────────────────────────────────────────

export interface ClerkWebhookResponse {
  received: true
}

// ── Clerk auth context (injected by middleware into request) ──────────────

export interface ClerkAuthContext {
  userId: string   // Clerk user ID (e.g., 'user_xxx')
  sessionId: string
}
```

### Fastify type augmentation

```ts
// apps/api/src/plugins/clerk-auth.ts

declare module 'fastify' {
  interface FastifyRequest {
    clerk: ClerkAuthContext
  }
}
```

### Error codes

| HTTP Status | `error.code` | When |
|---|---|---|
| `400` | `INVALID_WEBHOOK_SIGNATURE` | Svix signature verification failed |
| `401` | `UNAUTHORIZED` | Missing or invalid Bearer token |
| `401` | `SESSION_EXPIRED` | Token JWT has expired |
| `404` | `USER_NOT_FOUND` | Authenticated Clerk user has no DB row (edge case before webhook fires) |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

---

## Tests

### Specification Tests

Unit tests using Vitest. Each test targets a specific functional requirement.

**`apps/api/test/plugins/clerk-auth.test.ts`**

| Test | FR |
|---|---|
| Rejects request with no Authorization header → 401 | FR-2 |
| Rejects request with malformed Bearer token → 401 | FR-2 |
| Rejects request with expired JWT → 401 | FR-2 |
| Allows request with valid JWT, populates `request.clerk` | FR-2 |
| Skips auth for `GET /api/health` | FR-2 |
| Skips auth for `POST /api/webhooks/clerk` | FR-2 |

**`apps/api/test/routes/auth.test.ts`**

| Test | FR |
|---|---|
| Returns user profile and active license for authenticated user | FR-3 |
| Returns `license: null` when user has no active license | FR-3 |
| Returns `license: null` when license is expired | FR-3 |
| Returns 401 when not authenticated | FR-3 |
| Returns 404 when Clerk user has no DB row | FR-3 |

**`apps/api/test/routes/webhooks.test.ts`**

| Test | FR |
|---|---|
| Creates DB user on valid `user.created` event with valid signature | FR-4 |
| Returns 200 and does nothing for unknown event types | FR-4 |
| Returns 400 for missing svix headers | FR-17 |
| Returns 400 for invalid svix signature | FR-17 |
| Returns 400 for replayed request (stale timestamp) | FR-17 |
| Is idempotent: duplicate `user.created` with same clerk_id does not error | FR-4 |

**`apps/api/test/routes/health.test.ts`**

| Test | FR |
|---|---|
| Returns `{ status: 'ok' }` with 200 | FR-5 |
| Does not require Authorization header | FR-5 |

### Property-Based Tests

**`apps/api/test/properties/auth.property.test.ts`**

Using `fast-check`:

1. **Token validation is total:** For any arbitrary string passed as a Bearer token, the auth middleware either rejects with 401 or accepts and populates `request.clerk` with a valid `ClerkAuthContext`. It never throws an unhandled error or returns a 5xx for invalid tokens.
2. **Session state machine:** Given a sequence of `signIn`, `signOut`, and `getSession` operations, the auth state always follows the valid state transitions:
   - `signed-out` -> `signIn()` -> `signed-in`
   - `signed-in` -> `signOut()` -> `signed-out`
   - `signed-in` -> `getSession()` -> `signed-in` (returns session)
   - `signed-out` -> `getSession()` -> `signed-out` (returns null)
3. **Webhook idempotency:** For any sequence of `user.created` events with the same `clerk_id`, the `users` table contains exactly one row for that `clerk_id` after all events are processed.

### Mutation / Genetic Modification Tests

The following mutations must be caught by the specification tests above. If a mutation survives, the test suite has a gap.

| Mutation | Target | Must be caught by |
|---|---|---|
| Remove `svix.verify()` call in webhook handler | `routes/webhooks.ts` | `webhooks.test.ts` — invalid signature test must fail (webhook would accept unsigned payloads) |
| Remove `Authorization` header check in auth middleware | `plugins/clerk-auth.ts` | `clerk-auth.test.ts` — no-auth test must fail (request would be accepted without token) |
| Change unauthenticated status from `401` to `200` | `plugins/clerk-auth.ts` | `clerk-auth.test.ts` — must assert exact 401 status code |
| Remove health route exclusion from auth middleware | `plugins/clerk-auth.ts` | `health.test.ts` — health check would require auth |
| Return hardcoded `tier: 'pro'` instead of querying DB | `routes/auth.ts` | `auth.test.ts` — Plus user test must fail |
| Skip `safeStorage.encryptString()` (store token as plain text) | `main/auth.ts` | Electron auth test must verify encrypted storage |
| Remove redirect URL validation in OAuth callback | `main/auth.ts` | Auth flow test must verify only `racedash://auth/callback` is accepted |
| Remove Svix timestamp tolerance check | `routes/webhooks.ts` | `webhooks.test.ts` — stale timestamp test must fail |

### Characterisation Tests

Snapshot tests that lock down the shape of API responses. These prevent accidental breaking changes to the contract.

**`apps/api/test/snapshots/auth-me.snap.ts`**

```ts
// Snapshot: GET /api/auth/me response shape (user with Pro license)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "user": {
      "id": Any<String>,
      "clerkId": Any<String>,
      "email": Any<String>,
      "name": Any<String>,
      "avatarUrl": Any<String | null>,
      "createdAt": Any<String>,
    },
    "license": {
      "tier": "pro",
      "status": "active",
      "expiresAt": Any<String>,
    },
  }
`)

// Snapshot: GET /api/auth/me response shape (user with no license)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "user": {
      "id": Any<String>,
      "clerkId": Any<String>,
      "email": Any<String>,
      "name": Any<String>,
      "avatarUrl": Any<String | null>,
      "createdAt": Any<String>,
    },
    "license": null,
  }
`)
```

**`apps/api/test/snapshots/webhook-response.snap.ts`**

```ts
// Snapshot: POST /api/webhooks/clerk success response
expect(response.json()).toMatchInlineSnapshot(`
  {
    "received": true,
  }
`)

// Snapshot: POST /api/webhooks/clerk error response (invalid signature)
expect(response.json()).toMatchInlineSnapshot(`
  {
    "error": {
      "code": "INVALID_WEBHOOK_SIGNATURE",
      "message": Any<String>,
    },
  }
`)
```

**`apps/api/test/snapshots/error-response.snap.ts`**

```ts
// Snapshot: 401 Unauthorized response shape
expect(response.json()).toMatchInlineSnapshot(`
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": Any<String>,
    },
  }
`)
```
