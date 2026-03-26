# Clerk Electron Auth Refactor — Design Spec

## Problem

The desktop app authenticates via a BrowserWindow that loads Clerk's Account Portal. This approach fails because:

1. Clerk's Account Portal doesn't support custom URL scheme redirects (`racedash://`)
2. The `__session` JWT cookie has a ~60s TTL and is stale by the time the redirect completes
3. No automatic token refresh — the app stores a one-time JWT that eventually expires

## Solution

Move Clerk authentication to the **renderer** using `@clerk/clerk-react` + `@clerk/clerk-js/headless`. The renderer handles sign-in UI, session management, and automatic token refresh. Tokens are synced to the main process via IPC so the existing `fetchWithAuth` pattern stays unchanged.

## Architecture

```
Renderer                              Main Process
┌──────────────────────────┐          ┌───────────────────────────┐
│ Clerk SDK (headless)     │──IPC──→  │ Token store (in-memory)   │
│ Custom SignIn/SignUp form │  token   │ + safeStorage (disk)      │
│ ClerkProvider wrapper    │  sync    │                           │
│ useAuth hook (rewired)   │          │ fetchWithAuth()           │
│ AuthGuard component      │←─IPC──  │ cloud-render-handlers     │
│                          │  token   │ license-handlers          │
│                          │  request │ stripe, youtube, etc.     │
└──────────────────────────┘          └───────────────────────────┘
```

**Key principle:** Renderer is the token authority. Main process is a consumer.

## Token Lifecycle

Two tokens at play:

- **Client JWT** — long-lived, issued by Clerk, persists across app restarts. Stored encrypted on disk via `safeStorage`.
- **Session JWT** — short-lived (~60s), auto-refreshed by Clerk SDK. Sent as `Authorization: Bearer` to the API.

### Flows

**Sign-in:** User enters email/password in custom form → Clerk SDK authenticates → emits session JWT → renderer sends to main via IPC → main stores in memory + persists client JWT to disk.

**Token refresh:** Clerk SDK auto-refreshes session JWT → renderer pushes fresh token to main via IPC → main updates in-memory token.

**API calls:** Main process reads in-memory token → adds `Authorization: Bearer` header → calls API. No change to existing handlers.

**App restart:** Main loads encrypted client JWT from disk → passes to renderer via IPC → renderer initializes Clerk with cached token → Clerk fetches fresh session JWT → syncs back to main.

**Sign-out:** Renderer calls Clerk sign-out → IPC tells main to clear in-memory token + delete encrypted file.

**Session expired (7 days, free tier limit):** Clerk SDK detects expiry → renderer shows sign-in form → main clears stale token.

## IPC Channels

### New channels

| Channel | Direction | Purpose |
|---|---|---|
| `racedash:auth:token:save` | renderer → main | Push fresh session JWT + client JWT for storage |
| `racedash:auth:token:get` | renderer → main (invoke) | Renderer asks main for cached client JWT on startup |
| `racedash:auth:token:clear` | renderer → main | Clear stored tokens on sign-out |

### Removed channels

| Channel | Reason |
|---|---|
| `racedash:auth:signIn` | Sign-in happens in renderer now |
| `racedash:auth:signOut` | Replaced by `token:clear` + Clerk SDK sign-out in renderer |
| `racedash:auth:getSession` | Replaced by `token:get`; session state lives in renderer |

### Kept as-is

| Channel | Reason |
|---|---|
| `racedash:auth:fetchWithAuth` | Main still handles authenticated API calls |
| `racedash:auth:sessionExpired` | Main → renderer push when API returns 401 |
| All license, credits, cloud render, stripe, youtube channels | Unchanged |

## File Changes

### New files

| File | Purpose |
|---|---|
| `src/renderer/lib/clerk.ts` | Headless Clerk instance with custom `MemoryTokenCache` (IPC-backed), request/response interceptors for token sync |
| `src/renderer/src/provider/ClerkProvider.tsx` | Wrapper around `@clerk/clerk-react` ClerkProvider with headless instance config |
| `src/renderer/src/components/auth/SignInForm.tsx` | Custom email + password form using `useSignIn` hook |
| `src/renderer/src/components/auth/SignUpForm.tsx` | Custom email + password + email verification code form using `useSignUp` hook |
| `src/renderer/src/components/auth/AuthGuard.tsx` | Shows sign-in/sign-up when not authenticated, renders children when authenticated |

### Modified files

| File | Change |
|---|---|
| `src/renderer/src/hooks/useAuth.ts` | Rewrite to use Clerk's `useUser`, `useSession`, `useClerk`. Keep same return interface (`user`, `license`, `isSignedIn`, `isLoading`, `signIn`, `signOut`). Add token sync to main via IPC on session change. After Clerk sign-in, call `fetchWithAuth('/api/auth/me')` via IPC to get `AuthUser` + `AuthLicense` from the API (Clerk doesn't know about licenses). |
| `src/renderer/src/App.tsx` (or root layout) | Wrap with `ClerkProvider` |
| `src/main/auth.ts` | Strip down to token storage: `saveToken`, `loadToken`, `clearToken`, register IPC handlers for the 3 new channels. Remove BrowserWindow, HTTP server, cookie extraction, fetchProfile. |
| `src/main/auth-helpers.ts` | `loadSessionToken()` reads from in-memory store instead of encrypted file |
| `src/main/index.ts` | Replace `registerAuthHandlers(win)` with `registerTokenHandlers()` |
| `src/preload/index.ts` | Replace old auth IPC methods with new token channels (`token:save`, `token:get`, `token:clear`) |

### Unchanged files

| File | Reason |
|---|---|
| `src/main/api-client.ts` | Already calls `loadSessionToken()` — no change needed |
| `src/main/cloud-render-handlers.ts` | Uses `fetchWithAuth` — no change |
| `src/main/license-handlers.ts` | Uses `fetchWithAuth` — no change |
| `src/main/stripe-checkout.ts` | Uses `fetchWithAuth` — no change |
| `src/main/youtube.ts` | Uses `fetchWithSession` (same pattern) — no change |
| `src/renderer/src/screens/ProjectLibrary.tsx` | Already uses `useAuth()` hook — no change |
| `src/renderer/src/components/app/AccountDetails.tsx` | Already uses `useAuth()` return values — no change |

## Sign-In / Sign-Up UI

Custom forms rendered inline in the app (no separate windows or modals).

`AuthGuard` wraps the main app content. When not signed in, it renders `SignInForm` with a toggle to `SignUpForm`. When signed in, it renders children (normal app).

### SignInForm

- Email input field
- Password input field
- Submit button
- "Don't have an account? Sign up" link → toggles to SignUpForm
- Error display for invalid credentials
- Uses `useSignIn()` hook from `@clerk/clerk-react`

### SignUpForm

- Email input field
- Password input field
- Submit button → triggers email verification
- Verification code input (6 digits) shown after submit
- "Already have an account? Sign in" link → toggles to SignInForm
- Uses `useSignUp()` hook from `@clerk/clerk-react`

### Auth method

- Email + password only (no social OAuth for now — expandable later)
- Email verification via code during sign-up

## Dependencies

### Add

- `@clerk/clerk-react` — React hooks and ClerkProvider
- `@clerk/clerk-js` — Headless Clerk instance (`@clerk/clerk-js/headless` subpath)

### Environment variables

- `VITE_CLERK_PUBLISHABLE_KEY` — keep (already exists)
- `VITE_CLERK_ACCOUNTS_URL` — remove (no longer needed)
- `VITE_API_URL` — keep (unchanged)

## What Stays The Same

- All main process API call handlers (cloud render, license, credits, stripe, youtube)
- The `fetchWithAuth` / `loadSessionToken` pattern
- The `AuthSession`, `AuthUser`, `AuthLicense` types
- Token encryption on disk via `safeStorage`
- The `useAuth()` hook return interface (consumers don't change)
- All renderer screens and components that consume `useAuth()`

## Testing

- Unit tests for `MemoryTokenCache` IPC round-trip (mock IPC)
- Unit tests for `SignInForm` / `SignUpForm` (mock Clerk hooks)
- Unit test for `AuthGuard` (renders sign-in when no session, children when session exists)
- Unit test for `useAuth` hook (token sync fires on session change)
- Integration test: main process token handlers (save/get/clear with mock safeStorage)
