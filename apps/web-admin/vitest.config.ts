import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    root: '.',
    environment: 'jsdom',
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
