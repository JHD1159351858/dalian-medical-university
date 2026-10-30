import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests', testMatch: 'tcm-upgrade.spec.ts', timeout: 180_000,
  expect: { timeout: 15_000 }, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4273', viewport: { width: 1440, height: 1000 }, channel: 'chrome', headless: true, actionTimeout: 15_000, launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node server/index.mjs', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: process.env.TCM_REUSE_SERVER === '1' },
    { command: 'npx vite --host 127.0.0.1 --port 4273 --strictPort', url: 'http://127.0.0.1:4273', reuseExistingServer: process.env.TCM_REUSE_SERVER === '1' },
  ],
})
