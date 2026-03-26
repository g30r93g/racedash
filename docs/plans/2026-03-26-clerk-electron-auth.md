# Clerk Electron Auth Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken BrowserWindow-based Clerk OAuth flow with `@clerk/clerk-react` + `@clerk/clerk-js/headless` in the renderer, with IPC token sync to the main process.

**Architecture:** Clerk SDK lives in the renderer and handles sign-in UI, session management, and automatic token refresh. Tokens are synced to the main process via IPC so the existing `fetchWithAuth` pattern used by 5+ handler files stays unchanged. Custom sign-in/sign-up forms using Clerk hooks replace the Account Portal BrowserWindow.

**Tech Stack:** `@clerk/clerk-react`, `@clerk/clerk-js` (headless), Electron IPC, React, TypeScript, `safeStorage`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/desktop/src/renderer/lib/clerk.ts` | Headless Clerk instance with IPC-backed token cache |
| Create | `apps/desktop/src/renderer/src/provider/ClerkProvider.tsx` | ClerkProvider wrapper with headless instance |
| Create | `apps/desktop/src/renderer/src/components/auth/SignInForm.tsx` | Custom email+password sign-in form |
| Create | `apps/desktop/src/renderer/src/components/auth/SignUpForm.tsx` | Custom email+password+verification sign-up form |
| Create | `apps/desktop/src/renderer/src/components/auth/AuthGuard.tsx` | Shows auth forms or children based on sign-in state |
| Modify | `apps/desktop/src/main/auth.ts` | Strip to token storage IPC handlers only |
| Modify | `apps/desktop/src/main/auth-helpers.ts` | Read token from in-memory store |
| Modify | `apps/desktop/src/main/index.ts` | Replace `registerAuthHandlers` with `registerTokenHandlers` |
| Modify | `apps/desktop/src/main/env.d.ts` | Remove `VITE_CLERK_ACCOUNTS_URL` |
| Modify | `apps/desktop/src/preload/index.ts` | Replace auth IPC methods with token channels |
| Modify | `apps/desktop/src/types/ipc.ts` | Update RacedashAPI auth section |
| Modify | `apps/desktop/src/renderer/src/hooks/useAuth.ts` | Rewrite to use Clerk hooks + IPC token sync |
| Modify | `apps/desktop/src/renderer/src/main.tsx` | Wrap App with ClerkProvider |
| Modify | `apps/desktop/src/renderer/src/App.tsx` | Wrap content with AuthGuard |
| Modify | `apps/desktop/package.json` | Add @clerk/clerk-react, @clerk/clerk-js |
| Modify | `apps/desktop/.env.example` | Remove VITE_CLERK_ACCOUNTS_URL |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install Clerk packages**

Run from the monorepo root:
```bash
cd apps/desktop && pnpm add @clerk/clerk-react @clerk/clerk-js
```

- [ ] **Step 2: Verify installation**

Run:
```bash
pnpm ls @clerk/clerk-react @clerk/clerk-js
```

Expected: both packages listed with versions.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat(desktop): add @clerk/clerk-react and @clerk/clerk-js dependencies"
```

---

### Task 2: Main Process — Token Storage IPC Handlers

**Files:**
- Modify: `apps/desktop/src/main/auth.ts`
- Modify: `apps/desktop/src/main/auth-helpers.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/env.d.ts`

- [ ] **Step 1: Rewrite auth.ts to token-only handlers**

Replace the entire contents of `apps/desktop/src/main/auth.ts` with:

```typescript
import { safeStorage, ipcMain, app } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'

const TOKEN_FILE = 'clerk-client.enc'

/** In-memory session JWT — the source of truth for API calls */
let sessionToken: string | null = null

function getTokenPath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE)
}

function persistClientToken(clientJwt: string): void {
  const encrypted = safeStorage.encryptString(clientJwt)
  fs.writeFileSync(getTokenPath(), encrypted)
}

function loadClientToken(): string | null {
  const tokenPath = getTokenPath()
  if (!fs.existsSync(tokenPath)) return null
  try {
    const encrypted = fs.readFileSync(tokenPath)
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

function clearPersistedToken(): void {
  const tokenPath = getTokenPath()
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath)
  }
}

/** Called by auth-helpers.ts to get the current session JWT for API calls */
export function getSessionToken(): string | null {
  return sessionToken
}

export function registerTokenHandlers(): void {
  // Renderer pushes fresh tokens after Clerk sign-in or refresh
  ipcMain.on('racedash:auth:token:save', (_event, data: { sessionToken: string; clientToken: string }) => {
    sessionToken = data.sessionToken
    persistClientToken(data.clientToken)
  })

  // Renderer asks for cached client token on startup (to restore Clerk session)
  ipcMain.handle('racedash:auth:token:get', () => {
    return loadClientToken()
  })

  // Renderer tells main to clear everything on sign-out
  ipcMain.on('racedash:auth:token:clear', () => {
    sessionToken = null
    clearPersistedToken()
  })
}
```

- [ ] **Step 2: Update auth-helpers.ts to read from in-memory store**

Replace the entire contents of `apps/desktop/src/main/auth-helpers.ts` with:

```typescript
import { getSessionToken } from './auth'

export function loadSessionToken(): string | null {
  return getSessionToken()
}
```

- [ ] **Step 3: Update index.ts import**

In `apps/desktop/src/main/index.ts`, change:

```typescript
import { registerAuthHandlers } from './auth'
```

to:

```typescript
import { registerTokenHandlers } from './auth'
```

And change the call on line 138:

```typescript
registerAuthHandlers(win)
```

to:

```typescript
registerTokenHandlers()
```

Note: `registerTokenHandlers` does not take a `win` parameter — it only registers IPC handlers, no BrowserWindows.

- [ ] **Step 4: Update env.d.ts — remove VITE_CLERK_ACCOUNTS_URL**

Replace the contents of `apps/desktop/src/main/env.d.ts` with:

```typescript
/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 5: Verify it compiles**

Run:
```bash
cd apps/desktop && pnpm build
```

Expected: builds successfully (renderer will have broken imports temporarily — that's fine, we'll fix in later tasks).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/auth.ts apps/desktop/src/main/auth-helpers.ts apps/desktop/src/main/index.ts apps/desktop/src/main/env.d.ts
git commit -m "refactor(desktop): replace auth BrowserWindow with token storage IPC handlers"
```

---

### Task 3: Preload & Types — Update IPC Bridge

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/types/ipc.ts`

- [ ] **Step 1: Update the auth section in preload/index.ts**

Replace the auth section (lines 105-115) in `apps/desktop/src/preload/index.ts`:

```typescript
  // Auth
  auth: {
    signIn: () =>
      ipcRenderer.invoke('racedash:auth:signIn'),
    signOut: () =>
      ipcRenderer.invoke('racedash:auth:signOut'),
    getSession: () =>
      ipcRenderer.invoke('racedash:auth:getSession'),
    fetchWithAuth: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('racedash:auth:fetchWithAuth', url, init),
  },
```

with:

```typescript
  // Auth — token sync between renderer (Clerk) and main (API calls)
  auth: {
    saveToken: (sessionToken: string, clientToken: string) =>
      ipcRenderer.send('racedash:auth:token:save', { sessionToken, clientToken }),
    getClientToken: () =>
      ipcRenderer.invoke('racedash:auth:token:get') as Promise<string | null>,
    clearToken: () =>
      ipcRenderer.send('racedash:auth:token:clear'),
    fetchWithAuth: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
      ipcRenderer.invoke('racedash:auth:fetchWithAuth', url, init),
  },
```

- [ ] **Step 2: Update the RacedashAPI type in types/ipc.ts**

Replace the auth section (lines 377-383):

```typescript
  // Auth
  auth: {
    signIn(): Promise<AuthSession>
    signOut(): Promise<void>
    getSession(): Promise<AuthSession | null>
    fetchWithAuth(url: string, init?: FetchWithAuthOptions): Promise<FetchWithAuthResponse>
  }
```

with:

```typescript
  // Auth — token sync between renderer (Clerk) and main (API calls)
  auth: {
    saveToken(sessionToken: string, clientToken: string): void
    getClientToken(): Promise<string | null>
    clearToken(): void
    fetchWithAuth(url: string, init?: FetchWithAuthOptions): Promise<FetchWithAuthResponse>
  }
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts apps/desktop/src/types/ipc.ts
git commit -m "refactor(desktop): update preload IPC bridge for Clerk token sync"
```

---

### Task 4: Renderer — Headless Clerk Instance

**Files:**
- Create: `apps/desktop/src/renderer/lib/clerk.ts`

- [ ] **Step 1: Create the headless Clerk instance with IPC token cache**

Create `apps/desktop/src/renderer/lib/clerk.ts`:

```typescript
import type { FapiRequestInit, FapiResponse } from '@clerk/clerk-js/dist/types/core/fapiClient'
import { Clerk } from '@clerk/clerk-js/headless'

const CLIENT_TOKEN_KEY = '__clerk_client_jwt'

/**
 * Token cache backed by Electron IPC — persists the Clerk client JWT
 * to the main process (encrypted on disk via safeStorage).
 */
const IpcTokenCache = {
  async getToken(_key: string): Promise<string> {
    const token = await window.racedash.auth.getClientToken()
    return token ?? ''
  },
  saveToken(_key: string, token: string): void {
    // Client token is persisted; session token is synced separately
    window.racedash.auth.saveToken('', token)
  },
  clearToken(_key: string): void {
    window.racedash.auth.clearToken()
  },
}

let clerkInstance: Clerk | undefined

export function getClerkInstance(): Clerk {
  if (clerkInstance) return clerkInstance

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  if (!publishableKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable')
  }

  clerkInstance = new Clerk(publishableKey)

  // Intercept outgoing requests: strip cookies (not in a browser context),
  // append _is_native flag, and attach the cached JWT
  clerkInstance.__unstable__onBeforeRequest(async (requestInit: FapiRequestInit) => {
    requestInit.credentials = 'omit'
    requestInit.url?.searchParams.append('_is_native', '1')

    const jwt = await IpcTokenCache.getToken(CLIENT_TOKEN_KEY)
    ;(requestInit.headers as Headers).set('authorization', jwt || '')
  })

  // Intercept responses: capture the refreshed JWT from Clerk's API
  // and sync it to the main process for storage
  // @ts-expect-error __unstable__onAfterResponse is an internal API
  clerkInstance.__unstable__onAfterResponse(async (_: FapiRequestInit, response: FapiResponse<unknown>) => {
    const authHeader = response.headers.get('authorization')
    if (authHeader) {
      IpcTokenCache.saveToken(CLIENT_TOKEN_KEY, authHeader)
    }
  })

  return clerkInstance
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/lib/clerk.ts
git commit -m "feat(desktop): add headless Clerk instance with IPC-backed token cache"
```

---

### Task 5: Renderer — ClerkProvider Wrapper

**Files:**
- Create: `apps/desktop/src/renderer/src/provider/ClerkProvider.tsx`
- Modify: `apps/desktop/src/renderer/src/main.tsx`

- [ ] **Step 1: Create the ClerkProvider wrapper**

Create `apps/desktop/src/renderer/src/provider/ClerkProvider.tsx`:

```typescript
import { ClerkProvider as BaseClerkProvider } from '@clerk/clerk-react'
import type { ClerkProp } from '@clerk/clerk-react'
import type { PropsWithChildren } from 'react'
import { getClerkInstance } from '../../lib/clerk'

export function RaceDashClerkProvider({ children }: PropsWithChildren): React.ReactElement {
  const clerkInstance = getClerkInstance() as unknown as ClerkProp

  return (
    <BaseClerkProvider
      Clerk={clerkInstance}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </BaseClerkProvider>
  )
}
```

- [ ] **Step 2: Wrap App with ClerkProvider in main.tsx**

Replace `apps/desktop/src/renderer/src/main.tsx` with:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { RaceDashClerkProvider } from './provider/ClerkProvider'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RaceDashClerkProvider>
      <App />
    </RaceDashClerkProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/provider/ClerkProvider.tsx apps/desktop/src/renderer/src/main.tsx
git commit -m "feat(desktop): add ClerkProvider wrapper and wire into app root"
```

---

### Task 6: Renderer — Custom Sign-In Form

**Files:**
- Create: `apps/desktop/src/renderer/src/components/auth/SignInForm.tsx`

- [ ] **Step 1: Create the sign-in form**

Create `apps/desktop/src/renderer/src/components/auth/SignInForm.tsx`:

```typescript
import { useState } from 'react'
import { useSignIn } from '@clerk/clerk-react'

interface SignInFormProps {
  onToggleSignUp: () => void
}

export function SignInForm({ onToggleSignUp }: SignInFormProps): React.ReactElement {
  const { signIn, setActive, isLoaded } = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!isLoaded || !signIn) return

    setError('')
    setIsSubmitting(true)

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      })

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId })
      } else {
        setError('Sign-in could not be completed. Please try again.')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed'
      const clerkErr = err as { errors?: { longMessage?: string }[] }
      setError(clerkErr.errors?.[0]?.longMessage ?? message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Sign in to RaceDash</h1>
        <p className="mt-1 text-sm text-white/50">Enter your email and password</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-white/70">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-white/70">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="Your password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isLoaded}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-white/50">
        Don&apos;t have an account?{' '}
        <button onClick={onToggleSignUp} className="text-white underline underline-offset-2 hover:text-white/80">
          Sign up
        </button>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/auth/SignInForm.tsx
git commit -m "feat(desktop): add custom Clerk sign-in form"
```

---

### Task 7: Renderer — Custom Sign-Up Form with Email Verification

**Files:**
- Create: `apps/desktop/src/renderer/src/components/auth/SignUpForm.tsx`

- [ ] **Step 1: Create the sign-up form with verification**

Create `apps/desktop/src/renderer/src/components/auth/SignUpForm.tsx`:

```typescript
import { useState } from 'react'
import { useSignUp } from '@clerk/clerk-react'

interface SignUpFormProps {
  onToggleSignIn: () => void
}

export function SignUpForm({ onToggleSignIn }: SignUpFormProps): React.ReactElement {
  const { signUp, setActive, isLoaded } = useSignUp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingVerification, setPendingVerification] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!isLoaded || !signUp) return

    setError('')
    setIsSubmitting(true)

    try {
      await signUp.create({
        emailAddress: email,
        password,
      })

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPendingVerification(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-up failed'
      const clerkErr = err as { errors?: { longMessage?: string }[] }
      setError(clerkErr.errors?.[0]?.longMessage ?? message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerify(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!isLoaded || !signUp) return

    setError('')
    setIsSubmitting(true)

    try {
      const result = await signUp.attemptEmailAddressVerification({ code })

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId })
      } else {
        setError('Verification could not be completed. Please try again.')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed'
      const clerkErr = err as { errors?: { longMessage?: string }[] }
      setError(clerkErr.errors?.[0]?.longMessage ?? message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (pendingVerification) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Verify your email</h1>
          <p className="mt-1 text-sm text-white/50">We sent a code to {email}</p>
        </div>

        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-sm font-medium text-white/70">Verification code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-center text-lg tracking-widest text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
              placeholder="000000"
              maxLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !isLoaded}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? 'Verifying...' : 'Verify email'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="mt-1 text-sm text-white/50">Sign up to start using RaceDash Cloud</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signup-email" className="text-sm font-medium text-white/70">Email</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="signup-password" className="text-sm font-medium text-white/70">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            placeholder="Choose a password"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isLoaded}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm text-white/50">
        Already have an account?{' '}
        <button onClick={onToggleSignIn} className="text-white underline underline-offset-2 hover:text-white/80">
          Sign in
        </button>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/components/auth/SignUpForm.tsx
git commit -m "feat(desktop): add custom Clerk sign-up form with email verification"
```

---

### Task 8: Renderer — AuthGuard Component

**Files:**
- Create: `apps/desktop/src/renderer/src/components/auth/AuthGuard.tsx`

- [ ] **Step 1: Create the AuthGuard**

Create `apps/desktop/src/renderer/src/components/auth/AuthGuard.tsx`:

```typescript
import { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps): React.ReactElement {
  const { isSignedIn, isLoaded } = useUser()
  const [showSignUp, setShowSignUp] = useState(false)

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="flex h-full items-center justify-center bg-black/80 backdrop-blur-sm">
        {showSignUp ? (
          <SignUpForm onToggleSignIn={() => setShowSignUp(false)} />
        ) : (
          <SignInForm onToggleSignUp={() => setShowSignUp(true)} />
        )}
      </div>
    )
  }

  return <>{children}</>
}
```

- [ ] **Step 2: Wrap App content with AuthGuard**

In `apps/desktop/src/renderer/src/App.tsx`, add the import and wrap the content:

```typescript
import { ProjectLibrary } from '@/screens/ProjectLibrary'
import { Editor } from '@/screens/editor/Editor'
import { ProjectCreationWizard } from '@/screens/wizard/ProjectCreationWizard'
import { UpdateBanner } from '@/components/UpdateBanner'
import { AuthGuard } from '@/components/auth/AuthGuard'
import React, { useState } from 'react'
import type { ProjectData } from '../../types/project'

export function App(): React.ReactElement {
  const [project, setProject] = useState<ProjectData | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  function handleProjectCreated(created: ProjectData) {
    setWizardOpen(false)
    setProject(created)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* macOS traffic light clearance + window drag region.
          36px matches the hiddenInset inset on macOS.
          Any interactive element placed inside this region must set
          style={{ WebkitAppRegion: 'no-drag' }} to remain clickable. */}
      <div
        className="relative flex h-9 w-full shrink-0 items-center justify-center"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <UpdateBanner />
        <span className="text-xs font-medium text-white/40 select-none">RaceDash</span>
      </div>

      {/* Screen content — fills remaining height */}
      <div className="relative flex flex-1 overflow-hidden">
        <AuthGuard>
          {project ? (
            <Editor project={project} onClose={() => setProject(null)} />
          ) : (
            <>
              {/* Editor skeleton visible behind the library overlay */}
              <EditorSkeleton />
              {/* Project library floats over the skeleton */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm">
                <ProjectLibrary
                  onOpen={setProject}
                  onNew={() => setWizardOpen(true)}
                />
              </div>
            </>
          )}
        </AuthGuard>
      </div>
      {wizardOpen && (
        <ProjectCreationWizard
          onComplete={handleProjectCreated}
          onCancel={() => setWizardOpen(false)}
        />
      )}
    </div>
  )
}

function EditorSkeleton(): React.ReactElement {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left pane — video + timeline */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
        <div className="flex flex-1 items-center justify-center bg-[#0a0a0a]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7 4.5L16 10L7 15.5V4.5Z" fill="white" fillOpacity="0.15" />
            </svg>
          </div>
        </div>
        <div className="h-[140px] shrink-0 border-t border-border bg-[#111111]" />
      </div>
      {/* Right pane — tabs */}
      <div className="flex w-[430px] shrink-0 flex-col overflow-hidden bg-card" />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/components/auth/AuthGuard.tsx apps/desktop/src/renderer/src/App.tsx
git commit -m "feat(desktop): add AuthGuard and wrap app content"
```

---

### Task 9: Renderer — Rewrite useAuth Hook

**Files:**
- Modify: `apps/desktop/src/renderer/src/hooks/useAuth.ts`

- [ ] **Step 1: Rewrite useAuth to use Clerk hooks + IPC token sync**

Replace the entire contents of `apps/desktop/src/renderer/src/hooks/useAuth.ts` with:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { useUser, useSession, useClerk } from '@clerk/clerk-react'
import type { AuthUser, AuthLicense, FetchWithAuthResponse } from '../../../types/ipc'

interface UseAuthReturn {
  user: AuthUser | null
  license: AuthLicense | null
  isSignedIn: boolean
  isLoading: boolean
  signIn: () => void
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const { user: clerkUser, isSignedIn, isLoaded: userLoaded } = useUser()
  const { session } = useSession()
  const clerk = useClerk()
  const [profile, setProfile] = useState<{ user: AuthUser; license: AuthLicense | null } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Sync session token to main process whenever it changes
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function syncToken(): Promise<void> {
      try {
        const token = await session!.getToken()
        if (token && !cancelled) {
          // The client token is synced by the Clerk interceptors in lib/clerk.ts
          // Here we sync the session JWT that main process uses for API calls
          window.racedash.auth.saveToken(token, '')
        }
      } catch {
        // Token fetch failed — will retry on next render
      }
    }

    syncToken()

    // Re-sync every 50 seconds (session JWTs expire in ~60s)
    const interval = setInterval(syncToken, 50_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session])

  // Fetch user profile + license from API after sign-in
  useEffect(() => {
    if (!isSignedIn || !session) {
      setProfile(null)
      setIsLoading(!userLoaded)
      return
    }

    let cancelled = false

    async function fetchProfile(): Promise<void> {
      try {
        const token = await session!.getToken()
        if (!token || cancelled) return

        // Ensure main process has the token before making the API call
        window.racedash.auth.saveToken(token, '')

        const response: FetchWithAuthResponse = await window.racedash.auth.fetchWithAuth(
          '/api/auth/me',
        )

        if (cancelled) return

        if (response.status === 200) {
          const data = JSON.parse(response.body)
          setProfile({ user: data.user, license: data.license })
        } else {
          setProfile(null)
        }
      } catch {
        if (!cancelled) setProfile(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchProfile()
    return () => { cancelled = true }
  }, [isSignedIn, session, clerkUser?.id])

  const signIn = useCallback(() => {
    // AuthGuard handles showing the sign-in form — this is a no-op
    // Kept for interface compatibility with components that call signIn()
  }, [])

  const signOut = useCallback(async () => {
    await clerk.signOut()
    window.racedash.auth.clearToken()
    setProfile(null)
  }, [clerk])

  return {
    user: profile?.user ?? null,
    license: profile?.license ?? null,
    isSignedIn: isSignedIn === true && profile !== null,
    isLoading: isLoading || !userLoaded,
    signIn,
    signOut,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/hooks/useAuth.ts
git commit -m "refactor(desktop): rewrite useAuth to use Clerk hooks with IPC token sync"
```

---

### Task 10: Cleanup — Remove .env.example VITE_CLERK_ACCOUNTS_URL and Old Session File

**Files:**
- Modify: `apps/desktop/.env.example`
- Modify: `apps/desktop/.env` (local only, not committed)

- [ ] **Step 1: Remove VITE_CLERK_ACCOUNTS_URL from .env.example**

Replace `apps/desktop/.env.example` with:

```
VITE_API_URL=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
```

- [ ] **Step 2: Update your local .env**

Remove the `VITE_CLERK_ACCOUNTS_URL` line from `apps/desktop/.env`. The file should just have:

```
VITE_API_URL=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_<your-key>
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/.env.example
git commit -m "chore(desktop): remove VITE_CLERK_ACCOUNTS_URL from env example"
```

---

### Task 11: Integration Test — Verify End-to-End

- [ ] **Step 1: Build the desktop app**

Run:
```bash
cd apps/desktop && pnpm build
```

Expected: builds without errors.

- [ ] **Step 2: Ensure infrastructure is running**

Run:
```bash
pnpm local:up
```

- [ ] **Step 3: Ensure API is running**

Run:
```bash
cd apps/api && pnpm dev
```

- [ ] **Step 4: Start the desktop app**

Run:
```bash
pnpm desktop:dev
```

Expected: app launches, shows the sign-in form (not a BrowserWindow popup).

- [ ] **Step 5: Test sign-up flow**

1. Click "Sign up" link
2. Enter email + password
3. Check email for verification code
4. Enter code

Expected: verification succeeds, app shows the main UI.

- [ ] **Step 6: Test sign-in flow**

1. Sign out (via account details)
2. Enter email + password on sign-in form

Expected: signs in, app shows main UI with user profile.

- [ ] **Step 7: Test session persistence**

1. Close the desktop app completely
2. Reopen with `pnpm desktop:dev`

Expected: app restores session automatically (shows main UI, not sign-in form).

- [ ] **Step 8: Check API calls work**

1. Navigate to a screen that triggers an API call (e.g., credits balance, license check)

Expected: API calls succeed with the Clerk JWT — no 401 errors.

- [ ] **Step 9: Commit any fixups**

```bash
git add -A
git commit -m "fix(desktop): integration adjustments from end-to-end auth testing"
```

(Only if changes were needed. Skip if everything worked first try.)
