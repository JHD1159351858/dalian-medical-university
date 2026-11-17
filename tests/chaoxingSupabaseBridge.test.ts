import { afterEach, expect, it, vi } from 'vitest'
import { chaoxingBridgeConfigured, createChaoxingSupabaseSession } from '../server/chaoxingSupabaseBridge.mjs'

type StoredUser = { id: string; email: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }
type Options = { collision?: boolean; spoofedUserMetadata?: boolean; failCreate?: boolean; failLink?: boolean; failUpdate?: boolean; failVerify?: boolean; wrongSessionUser?: boolean; missingSession?: boolean }
const identity = { issuer: 'https://identity.example', subject: 'uid:student-1', displayName: '测试学生' }
const userId = '11111111-1111-4111-8111-111111111111'
const env = { SUPABASE_URL: 'https://database.example', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_admin', SSO_IDENTITY_SECRET: 'identity-test-secret-kept-stable-at-least-32-characters' }
const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token' }
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } })

function harness(options: Options = {}) {
  const users = new Map<string, StoredUser>()
  const requests: Array<{ url: URL; headers: Headers; body: Record<string, unknown> }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    const body: Record<string, unknown> = JSON.parse(String(init?.body ?? '{}'))
    const headers = new Headers(init?.headers)
    requests.push({ url, headers, body })
    if (url.pathname === '/auth/v1/admin/users') {
      if (options.failCreate) return response({ message: 'private create failure', code: 'unexpected_failure' }, 400)
      if (options.collision || options.spoofedUserMetadata) {
        users.set(String(body.email), { id: userId, email: String(body.email), app_metadata: options.collision ? { hospital_sso: { issuer: identity.issuer, subject: 'uid:someone-else' } } : {}, user_metadata: { hospital_sso: { issuer: identity.issuer, subject: identity.subject } } })
      }
      if (users.has(String(body.email))) return response({ message: 'already registered', code: 'email_exists' }, 422)
      const user = { id: userId, email: String(body.email), app_metadata: body.app_metadata as Record<string, unknown>, user_metadata: body.user_metadata as Record<string, unknown> }
      users.set(user.email, user)
      return response(user)
    }
    if (url.pathname === '/auth/v1/admin/generate_link') {
      if (options.failLink) return response({ message: 'private link failure', code: 'unexpected_failure' }, 400)
      const user = users.get(String(body.email))
      if (!user) throw new Error('Test link has no user')
      return response({ ...user, hashed_token: 'test-hashed-token', action_link: 'https://database.example/unused-link', email_otp: '123456', verification_type: 'magiclink', redirect_to: 'https://database.example' })
    }
    if (url.pathname === `/auth/v1/admin/users/${userId}`) {
      if (options.failUpdate) return response({ message: 'private update failure', code: 'unexpected_failure' }, 400)
      const user = [...users.values()][0]
      user.user_metadata = { ...user.user_metadata, ...body.user_metadata as Record<string, unknown> }
      return response(user)
    }
    if (url.pathname === '/auth/v1/verify') {
      if (options.failVerify) return response({ message: 'private verify failure', code: 'otp_expired' }, 403)
      if (options.missingSession) return response({ user: [...users.values()][0] })
      const user = [...users.values()][0]
      return response({ ...session, expires_in: 3600, token_type: 'bearer', user: { ...user, id: options.wrongSessionUser ? '22222222-2222-4222-8222-222222222222' : user.id } })
    }
    throw new Error('Unexpected bridge request: ' + url.pathname)
  }
  return { users, requests, fetchImpl }
}

afterEach(() => vi.restoreAllMocks())

it('creates a stable verified account without passwords and exchanges a magic link for a real session response', async () => {
  const h = harness()
  expect(await createChaoxingSupabaseSession(identity, { env, fetchImpl: h.fetchImpl })).toEqual(session)
  expect(h.requests.map(({ url }) => url.pathname)).toEqual(['/auth/v1/admin/users', '/auth/v1/admin/generate_link', `/auth/v1/admin/users/${userId}`, '/auth/v1/verify'])
  expect(h.requests[0].body).toMatchObject({ email_confirm: true, app_metadata: { hospital_sso: { issuer: identity.issuer, subject: identity.subject } }, user_metadata: { full_name: identity.displayName } })
  expect(h.requests[0].body).not.toHaveProperty('password')
  expect(h.requests[0].body.email).toMatch(/^cx_[a-f0-9]{48}@hospital-auth\.invalid$/)
  expect(h.requests[1].body.type).toBe('magiclink')
  expect(h.requests[3].body).toMatchObject({ token_hash: 'test-hashed-token', type: 'magiclink' })
  expect(h.requests.slice(0, 3).every(({ headers }) => headers.get('apikey') === env.SUPABASE_SERVICE_ROLE_KEY)).toBe(true)
  expect(h.requests[3].headers.get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY)
})

it('reuses the same account after a duplicate create and updates display data without changing its mapping', async () => {
  const h = harness()
  await createChaoxingSupabaseSession(identity, { env, fetchImpl: h.fetchImpl })
  await expect(createChaoxingSupabaseSession({ ...identity, displayName: '更新后的姓名' }, { env, fetchImpl: h.fetchImpl })).resolves.toEqual(session)
  expect(h.users.size).toBe(1)
  expect(h.requests[0].body.email).toBe(h.requests[4].body.email)
  expect([...h.users.values()][0].user_metadata.full_name).toBe('更新后的姓名')
})

it('keeps the mapping stable when the separate session encryption key rotates', async () => {
  const h = harness()
  await createChaoxingSupabaseSession(identity, { env: { ...env, SSO_SESSION_SECRET: 'session-key-first-value-at-least-32-characters' }, fetchImpl: h.fetchImpl })
  await createChaoxingSupabaseSession(identity, { env: { ...env, SSO_SESSION_SECRET: 'session-key-second-value-at-least-32-characters' }, fetchImpl: h.fetchImpl })
  expect(h.users.size).toBe(1)
  expect(h.requests[0].body.email).toBe(h.requests[4].body.email)
})

it.each([{ collision: true }, { spoofedUserMetadata: true }])('rejects an existing email account whose trusted mapping does not match: %j', async (options) => {
  const h = harness(options)
  await expect(createChaoxingSupabaseSession(identity, { env, fetchImpl: h.fetchImpl })).rejects.toThrow('超星登录会话暂时无法建立')
  expect(h.requests.some(({ url }) => url.pathname === '/auth/v1/verify')).toBe(false)
  expect(h.requests.some(({ url }) => url.pathname.includes(`/users/${userId}`))).toBe(false)
})

it.each([{ failCreate: true }, { failLink: true }, { failUpdate: true }, { failVerify: true }, { wrongSessionUser: true }, { missingSession: true }])('fails closed without exposing upstream errors or returning a fabricated session: %j', async (options) => {
  const h = harness(options)
  await expect(createChaoxingSupabaseSession(identity, { env, fetchImpl: h.fetchImpl })).rejects.toThrow('超星登录会话暂时无法建立')
  if (options.failCreate) expect(h.requests).toHaveLength(1)
})

it('requires an actual privileged server key and public configuration before making any requests', async () => {
  const h = harness()
  for (const key of ['', 'sb_publishable_not_admin', 'not-a-service-key']) {
    const config = { ...env, SUPABASE_SERVICE_ROLE_KEY: key }
    expect(chaoxingBridgeConfigured(config)).toBe(false)
    await expect(createChaoxingSupabaseSession(identity, { env: config, fetchImpl: h.fetchImpl })).rejects.toMatchObject({ status: 503 })
  }
  expect(chaoxingBridgeConfigured({ ...env, SUPABASE_URL: '' })).toBe(false)
  expect(h.requests).toHaveLength(0)
  expect(chaoxingBridgeConfigured(env)).toBe(true)
  const jwt = (role: string) => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.test-signature`
  expect(chaoxingBridgeConfigured({ ...env, SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') })).toBe(true)
  expect(chaoxingBridgeConfigured({ ...env, SUPABASE_SERVICE_ROLE_KEY: jwt('anon') })).toBe(false)
})

it('requires a dedicated stable identity secret and never substitutes the session encryption secret', async () => {
  const h = harness()
  for (const value of ['', 'short', ' '.repeat(40)]) {
    const config = { ...env, SSO_IDENTITY_SECRET: value, SSO_SESSION_SECRET: 'session-secret-cannot-substitute-for-identity-key' }
    expect(chaoxingBridgeConfigured(config)).toBe(false)
    await expect(createChaoxingSupabaseSession(identity, { env: config, fetchImpl: h.fetchImpl })).rejects.toMatchObject({ status: 503 })
  }
  expect(h.requests).toHaveLength(0)
})

it('rejects remote plain HTTP without fetching while allowing explicit loopback development URLs', async () => {
  const h = harness()
  const remote = { ...env, SUPABASE_URL: 'http://database.example' }
  expect(chaoxingBridgeConfigured(remote)).toBe(false)
  await expect(createChaoxingSupabaseSession(identity, { env: remote, fetchImpl: h.fetchImpl })).rejects.toMatchObject({ status: 503 })
  expect(h.requests).toHaveLength(0)
  for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321', 'http://[::1]:54321']) expect(chaoxingBridgeConfigured({ ...env, SUPABASE_URL: url })).toBe(true)
})

it('propagates platform tenant routing to every admin and public verification request', async () => {
  const h = harness()
  const platformEnv = { CODER_SUPABASE_URL: env.SUPABASE_URL, CODER_SUPABASE_ANON_KEY: env.SUPABASE_PUBLISHABLE_KEY, CODER_SUPABASE_TENANT_ID: 'hospital-tenant', SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY, SSO_IDENTITY_SECRET: env.SSO_IDENTITY_SECRET }
  expect(await createChaoxingSupabaseSession(identity, { env: platformEnv, fetchImpl: h.fetchImpl })).toEqual(session)
  expect(h.requests.every(({ headers }) => headers.get('X-Instance-ID') === 'hospital-tenant')).toBe(true)
})

it('keeps equivalent subject strings from different issuers in distinct mappings', async () => {
  const h = harness()
  await createChaoxingSupabaseSession(identity, { env, fetchImpl: h.fetchImpl })
  await createChaoxingSupabaseSession({ ...identity, issuer: 'https://other-identity.example' }, { env, fetchImpl: h.fetchImpl })
  expect(h.users.size).toBe(2)
  expect(h.requests[0].body.email).not.toBe(h.requests[4].body.email)
})
