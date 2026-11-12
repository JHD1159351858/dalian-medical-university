import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'e2e.spec.ts', timeout: 70_000,
  expect: { timeout: 15_000 }, fullyParallel: false, workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 900 },
    channel: process.env.CHROME_PATH ? undefined : 'chrome', headless: true,
    launchOptions: { executablePath: process.env.CHROME_PATH, args: ['--enable-webgl', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'node server/index.mjs', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  ],
});
