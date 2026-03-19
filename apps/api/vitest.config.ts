import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    root: '.',
    // Allow workspace packages to be transformed so vi.mock can intercept them
    server: {
      deps: {
        inline: [/@racedash\/.*/],
      },
    },
  },
  resolve: {
    alias: {
      // Point @racedash/db to its source so vitest can resolve it
      // even when the package hasn't been built (no dist/)
      '@racedash/db': path.resolve(__dirname, '../../packages/db/src/index.ts'),
    },
  },
})
