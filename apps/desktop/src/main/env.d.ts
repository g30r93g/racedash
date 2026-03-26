/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  readonly VITE_CLERK_ACCOUNTS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
