import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './electron',
  workers: 1,
  timeout: 60000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../test-results/electron-report' }]],
  outputDir: '../test-results/electron-artifacts',
})
