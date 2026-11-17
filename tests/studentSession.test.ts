import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), setSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
const session: Session = {
  access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
  user: { id: 'student-a', aud: 'authenticated', created_at: '2026-11-17T00:00:00.000Z', app_metadata: {}, user_metadata: {} },
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.createClient.mockReturnValue({ auth: { setSession: mocks.setSession, getUser: mocks.getUser, signOut: mocks.signOut } })
  mocks.setSession.mockResolvedValue({ data: { session }, error: null })
  mocks.getUser.mockResolvedValue({ data: { user: session.user }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ url: 'https://supabase.example', publishableKey: 'sb_publishable_test' })))
})
afterEach(() => vi.unstubAllGlobals())

it('persists and refreshes Supabase sessions while leaving callback handling to the server bridge', async () => {
  const { getStudentClient } = await import('../src/records/studentSession')
  const client = await getStudentClient()
  expect(await getStudentClient()).toBe(client)
  expect(mocks.createClient).toHaveBeenCalledTimes(1)
  expect(mocks.createClient).toHaveBeenCalledWith('https://supabase.example', 'sb_publishable_test', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
})

it('sends a configured tenant identifier through Supabase Auth and database client requests', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ url: 'https://supabase.example', publishableKey: 'sb_publishable_test', tenantId: 'hospital-tenant' })))
  const { getStudentClient } = await import('../src/records/studentSession')
  await getStudentClient()
  expect(mocks.createClient).toHaveBeenCalledWith('https://supabase.example', 'sb_publishable_test', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }, global: { headers: { 'X-Instance-ID': 'hospital-tenant' } },
  })
})

it('accepts the same 256-character tenant limit as the server', async () => {
  const tenantId = 't'.repeat(256)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ url: 'https://supabase.example', publishableKey: 'sb_publishable_test', tenantId })))
  const { getStudentClient } = await import('../src/records/studentSession')
  await expect(getStudentClient()).resolves.toBeDefined()
  expect(mocks.createClient).toHaveBeenCalledWith('https://supabase.example', 'sb_publishable_test', expect.objectContaining({ global: { headers: { 'X-Instance-ID': tenantId } } }))
})

it('validates the exchanged user with getUser before returning the session', async () => {
  const verifiedUser = { ...session.user, user_metadata: { display_name: '已验证学生' } }
  mocks.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null })
  const { setStudentSession } = await import('../src/records/studentSession')
  expect(await setStudentSession({ access_token: 'test-access', refresh_token: 'test-refresh' })).toEqual({ ...session, user: verifiedUser })
  expect(mocks.getUser).toHaveBeenCalledWith('test-access')
  expect(mocks.signOut).not.toHaveBeenCalled()
})

it.each(['set-error', 'set-throw', 'user-error', 'user-mismatch'])('clears an invalid session and suppresses private SDK details for %s', async (failure) => {
  if (failure === 'set-error') mocks.setSession.mockResolvedValue({ data: { session: null }, error: new Error('secret test-token') })
  if (failure === 'set-throw') mocks.setSession.mockRejectedValue(new Error('secret test-token'))
  if (failure === 'user-error') mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('secret test-token') })
  if (failure === 'user-mismatch') mocks.getUser.mockResolvedValue({ data: { user: { ...session.user, id: 'student-b' } }, error: null })
  const { setStudentSession } = await import('../src/records/studentSession')
  await expect(setStudentSession({ access_token: 'test-access', refresh_token: 'test-refresh' })).rejects.toMatchObject({ status: 401, message: '学生登录会话无效，请重新登录。' })
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
})

it('rejects malformed public configuration and permits a later retry after configuration is fixed', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ url: 'https://supabase.example', publishableKey: 'sb_publishable_test', tenantId: 'unsafe\r\nheader' }))
    .mockResolvedValueOnce(Response.json({ url: 'https://supabase.example', publishableKey: 'sb_publishable_test' }))
  vi.stubGlobal('fetch', fetchMock)
  const { getStudentClient } = await import('../src/records/studentSession')
  await expect(getStudentClient()).rejects.toMatchObject({ status: 503 })
  expect(mocks.createClient).not.toHaveBeenCalled()
  await expect(getStudentClient()).resolves.toBeDefined()
  expect(mocks.createClient).toHaveBeenCalledTimes(1)
})

it('reports sign-out failure safely rather than exposing the SDK error', async () => {
  mocks.signOut.mockRejectedValue(new Error('private refresh-token'))
  const { clearStudentSession } = await import('../src/records/studentSession')
  await expect(clearStudentSession()).rejects.toMatchObject({ status: 503, message: '退出登录失败，请稍后重试。' })
})
