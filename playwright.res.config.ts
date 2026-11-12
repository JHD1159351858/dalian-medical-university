import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: 'res-audit.spec.ts', timeout: 420_000,
  expect: { timeout: 15_000 }, fullyParallel: false, workers: 1,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4173', viewport: { width: 1366, height: 768 },
    channel: process.env.CHROME_PATH ? undefined : 'chrome', headless: true,
    launchOptions: { executablePath: process.env.CHROME_PATH, args: ['--enable-webgl', '--ignore-gpu-blocklist'] },
    screenshot: 'off', trace: 'off',
  },
  webServer: [
    { command: 'node server/index.mjs', cwd: __dirname, url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: true },
    { command: 'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort', cwd: __dirname, url: 'http://127.0.0.1:4173', reuseExistingServer: true },
  ],
});
