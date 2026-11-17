import { expect, test } from '@playwright/test'
import { mockAuthentication } from './helpers/mockStudentAuth'

test('finishes one session handoff, restores the student after reload and signs out', async ({ page }) => {
  const mocked = await mockAuthentication(page)
  await page.goto('/')
  await page.getByRole('button', { name: '超星登录', exact: true }).click()
  await expect(page.getByText('测试学生', { exact: true })).toBeVisible()
  expect(mocked.handoffs()).toBe(1)
  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await expect(page.getByText('测试学生', { exact: true })).toBeVisible()
  expect(mocked.handoffs()).toBe(1)
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '超星登录', exact: true })).toBeEnabled()
  await expect(page.getByText('测试学生', { exact: true })).toHaveCount(0)
})

test('reports missing configuration without leaving the homepage or showing password fields', async ({ page }) => {
  await mockAuthentication(page)
  await page.route('**/api/auth/chaoxing/config', (route) => route.fulfill({ json: { available: false, message: 'configuration missing' } }))
  await page.goto('/')
  await page.getByRole('button', { name: '超星登录', exact: true }).click()
  await expect(page.locator('.student-auth-notice')).toContainText('超星登录尚未配置')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})

test('requires login when starting training and stays on the homepage if login is unavailable', async ({ page }) => {
  const mocked = await mockAuthentication(page)
  await page.route('**/api/auth/chaoxing/config', (route) => route.fulfill({ json: { available: false } }))
  await page.goto('/')
  await page.getByRole('button', { name: '开始实训', exact: true }).click()
  await expect(page.locator('.student-auth-notice')).toContainText('超星登录尚未配置')
  await expect(page.locator('.town-home')).toBeVisible()
  await expect(page.getByRole('button', { name: '静音', exact: true })).toHaveCount(0)
  expect(mocked.handoffs()).toBe(0)
})

test('logs in before entering training and returns to the requested case page', async ({ page }) => {
  const mocked = await mockAuthentication(page)
  await page.goto('/')
  await page.getByRole('button', { name: '开始实训', exact: true }).click()
  await expect(page).toHaveURL(/\/training$/)
  await expect(page.getByText('测试学生', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '静音', exact: true })).toBeVisible()
  expect(mocked.next()).toBe('/training')
  expect(mocked.handoffs()).toBe(1)
})

test('blocks direct training access until the student logs in', async ({ page }) => {
  const mocked = await mockAuthentication(page)
  await page.goto('/training')
  await expect(page.getByRole('heading', { name: '请先登录', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '静音', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '超星登录', exact: true }).click()
  await expect(page.getByText('测试学生', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '静音', exact: true })).toBeVisible()
  expect(mocked.handoffs()).toBe(1)
})

test('waits for the stored session to be verified before enabling training', async ({ page }) => {
  await mockAuthentication(page, true)
  let release = () => {}
  const verification = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/auth/v1/user', async (route) => {
    await verification
    await route.fallback()
  })
  try {
    await page.goto('/')
    await expect(page.getByRole('button', { name: '正在检查登录…', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '静音', exact: true })).toHaveCount(0)
  } finally { release() }
  await page.getByRole('button', { name: '开始实训', exact: true }).click()
  await expect(page.getByRole('button', { name: '静音', exact: true })).toBeVisible()
})

test('rejects an invalid stored session instead of opening the case', async ({ page }) => {
  await mockAuthentication(page, true)
  await page.route('**/auth/v1/user', (route) => route.fulfill({ status: 401, json: { message: 'invalid session' } }))
  await page.goto('/training')
  await expect(page.getByRole('heading', { name: '请先登录', exact: true })).toBeVisible()
  await expect(page.getByText('测试学生', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '静音', exact: true })).toHaveCount(0)
})

test('shows a safe callback failure without attempting session exchange', async ({ page }) => {
  const mocked = await mockAuthentication(page)
  await page.goto('/auth/chaoxing/callback?error=invalid_state')
  await expect(page.locator('.student-auth-card').getByRole('alert')).toContainText('登录请求已失效')
  await expect(page.getByRole('button', { name: '重新超星登录', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/chaoxing\/callback$/)
  expect(mocked.handoffs()).toBe(0)
})
