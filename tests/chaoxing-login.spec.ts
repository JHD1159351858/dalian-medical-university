import { expect, test, type Page } from '@playwright/test'

async function mockAuthentication(page: Page) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now, iss: 'https://supabase.example/auth/v1' })}.${Buffer.from('test-signature').toString('base64url')}`
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'student@sso.invalid', created_at: '2026-11-17T00:00:00.000Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: '测试学生' } }
  let handoffs = 0
  await page.route('**/api/records-config', (route) => route.fulfill({ json: { url: 'https://supabase.example', publishableKey: 'sb_publishable_test' } }))
  await page.route('**/api/auth/chaoxing/config', (route) => route.fulfill({ json: { available: true } }))
  await page.route((url) => url.pathname === '/api/auth/chaoxing', (route) => route.fulfill({ status: 302, headers: { location: '/auth/chaoxing/callback' } }))
  await page.route('**/api/auth/chaoxing/session', (route) => {
    handoffs += 1
    return route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', next: '/' } })
  })
  await page.route((url) => url.origin === 'https://supabase.example', (route) => {
    const url = new URL(route.request().url())
    return route.fulfill(url.pathname.endsWith('/user') ? { json: user } : { status: 204, body: '' })
  })
  await page.route((url) => url.pathname === '/api/auth/chaoxing/logout', (route) => route.fulfill({ status: 302, headers: { location: '/' } }))
  return { handoffs: () => handoffs }
}

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

test('shows a safe callback failure without attempting session exchange', async ({ page }) => {
  const mocked = await mockAuthentication(page)
  await page.goto('/auth/chaoxing/callback?error=invalid_state')
  await expect(page.getByRole('alert')).toContainText('登录请求已失效')
  await expect(page.getByRole('button', { name: '重新超星登录', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/chaoxing\/callback$/)
  expect(mocked.handoffs()).toBe(0)
})
