import type { Page } from '@playwright/test'

export async function mockAuthentication(page: Page, signedIn = false) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now, iss: 'https://supabase.example/auth/v1' })}.${Buffer.from('test-signature').toString('base64url')}`
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'student@sso.invalid', created_at: '2026-11-17T00:00:00.000Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: '测试学生' } }
  let handoffs = 0
  let next = '/'
  if (signedIn) await page.addInitScript((session) => {
    localStorage.setItem('sb-supabase-auth-token', JSON.stringify(session))
  }, { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user })
  await page.route('**/api/records-config', (route) => route.fulfill({ json: { url: 'https://supabase.example', publishableKey: 'sb_publishable_test' } }))
  await page.route('**/api/auth/chaoxing/config', (route) => route.fulfill({ json: { available: true } }))
  await page.route((url) => url.pathname === '/api/auth/chaoxing', (route) => {
    next = new URL(route.request().url()).searchParams.get('next') ?? '/'
    return route.fulfill({ status: 302, headers: { location: '/auth/chaoxing/callback' } })
  })
  await page.route('**/api/auth/chaoxing/session', (route) => {
    handoffs += 1
    return route.fulfill({ json: { access_token: token, refresh_token: 'test-refresh', next } })
  })
  await page.route((url) => url.origin === 'https://supabase.example', (route) => {
    const url = new URL(route.request().url())
    return route.fulfill(url.pathname.endsWith('/user') ? { json: user } : { status: 204, body: '' })
  })
  await page.route((url) => url.pathname === '/api/auth/chaoxing/logout', (route) => route.fulfill({ status: 302, headers: { location: '/' } }))
  return { handoffs: () => handoffs, next: () => next }
}
