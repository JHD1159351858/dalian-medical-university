import { defineConfig } from '@playwright/test'
import base from './playwright.tcm.config'

export default defineConfig({ ...base, testMatch: 'chaoxing-login.spec.ts', timeout: 60_000 })
