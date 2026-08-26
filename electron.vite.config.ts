import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/main', rollupOptions: { input: resolve('electron/main.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/preload', rollupOptions: { input: resolve('electron/preload.ts') } }
  },
  renderer: {
    root: '.',
    plugins: [vue()],
    optimizeDeps: { entries: [resolve('index.html')] },
    build: { rollupOptions: { input: resolve('index.html') } }
  }
})
