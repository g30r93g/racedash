import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@renderer': resolve(__dirname, '../renderer/src'),
        // Resolve workspace packages to TypeScript source so Vite transforms them
        // as ESM rather than serving their CJS dist via /@fs/ in both dev and
        // production (avoids CJS named-export resolution failures in Rollup/browser).
        '@racedash/core': resolve(__dirname, '../../packages/core/src/index.ts'),
        '@racedash/timestamps': resolve(__dirname, '../../packages/timestamps/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
