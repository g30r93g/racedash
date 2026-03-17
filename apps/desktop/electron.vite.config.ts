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
      },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
      // Extend commonjs transform to workspace packages (packages/**/dist/*.js).
      // By default @rollup/plugin-commonjs only covers node_modules; workspace
      // packages resolved via the @renderer alias are outside node_modules and
      // would otherwise be treated as ESM, causing named-export resolution errors.
      commonjsOptions: {
        include: [/packages\//, /node_modules/],
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
