import { defineConfig } from '@playwright/test'
import tcm from './playwright.tcm.config'

export default defineConfig({
  ...tcm,
  use: { ...tcm.use, baseURL: 'http://127.0.0.1:5175' },
  webServer: {
    command: 'pnpm exec tsx src/server.ts',
    url: 'http://127.0.0.1:5175/api/health',
    env: { NODE_ENV: 'development', DEPLOY_RUN_PORT: '5175', HOSTNAME: '127.0.0.1' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
