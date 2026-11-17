import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setStudentSession: vi.fn() }))
vi.mock('../src/records/studentSession', () => ({ setStudentSession: mocks.setStudentSession }))
const session: Session = {
  access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
  user: { id: 'student-a', aud: 'authenticated', created_at: '2026-11-17T00:00:00.000Z', app_metadata: {}, user_metadata: {} },
}

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.setStudentSession.mockResolvedValue(session) })
afterEach(() => vi.unstubAllGlobals())

it('constructs only same-origin login and logout entrypoints and removes secrets from return paths', async () => {
  const { getChaoxingLoginUrl, getChaoxingLogoutUrl } = await import('../src/auth/chaoxingAuth')
  const login = new URL(getChaoxingLoginUrl('/training?view=records&ticket=one-use&access_token=private'), 'https://app.example')
  expect(login.pathname).toBe('/api/auth/chaoxing')
  expect(login.searchParams.get('next')).toBe('/training?view=records')
  expect(login.href).not.toContain('one-use')
  expect(login.href).not.toContain('private')
  const logout = new URL(getChaoxingLogoutUrl(), 'https://app.example')
  expect(logout.pathname).toBe('/api/auth/chaoxing/logout')
  expect(logout.searchParams.get('next')).toBe('/')
})

it.each(['https://other.example', '//other.example', '/\\other.example', '/%2f%2fother.example', '/safe/..//other.example', '/%2e%2e//other.example', '/training\r\nunsafe', 'javascript:alert(1)'])('does not use an unsafe return destination %s', async (next) => {
  const { getChaoxingLoginUrl, getChaoxingLogoutUrl } = await import('../src/auth/chaoxingAuth')
  expect(new URL(getChaoxingLoginUrl(next), 'https://app.example').searchParams.get('next')).toBe('/training')
  expect(new URL(getChaoxingLogoutUrl(next), 'https://app.example').searchParams.get('next')).toBe('/')
})

it('reads availability from the server and does not echo private configuration details', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ available: true }))
    .mockResolvedValueOnce(Response.json({ available: false, message: 'private access_token=do-not-display' }))
  vi.stubGlobal('fetch', fetchMock)
  const { getChaoxingLoginConfiguration } = await import('../src/auth/chaoxingAuth')
  expect(await getChaoxingLoginConfiguration()).toEqual({ available: true })
  expect(await getChaoxingLoginConfiguration()).toEqual({ available: false, message: '超星登录尚未配置，请联系管理员。' })
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/chaoxing/config', { credentials: 'same-origin', redirect: 'error' })
})

it.each([{}, { available: 'yes' }, { available: false, message: { secret: 'private' } }])('rejects malformed availability output', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
  const { getChaoxingLoginConfiguration } = await import('../src/auth/chaoxingAuth')
  await expect(getChaoxingLoginConfiguration()).rejects.toThrow('返回格式异常')
})

it('redeems the HttpOnly handoff only once across duplicate callback callers', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', next: '/training?view=records' }))
  vi.stubGlobal('fetch', fetchMock)
  const { completeChaoxingLogin } = await import('../src/auth/chaoxingAuth')
  const first = completeChaoxingLogin()
  expect(completeChaoxingLogin()).toBe(first)
  expect(await first).toEqual({ session, next: '/training?view=records' })
  expect(await completeChaoxingLogin()).toBe(await first)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/chaoxing/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', credentials: 'same-origin', redirect: 'error',
  })
  expect(mocks.setStudentSession).toHaveBeenCalledWith({ access_token: 'test-access', refresh_token: 'test-refresh' })
})

it.each([undefined, 123, 'https://other.example', '//other.example', '/safe/..//other.example'])('falls back to the homepage for a missing or unsafe handoff destination %s', async (next) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', next })))
  const { completeChaoxingLogin } = await import('../src/auth/chaoxingAuth')
  expect(await completeChaoxingLogin()).toEqual({ session, next: '/' })
})

it.each([401, 503])('retains a failed single-use handoff result and exposes only safe errors for HTTP %s', async (status) => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: 'private ticket and refresh_token' }, { status }))
  vi.stubGlobal('fetch', fetchMock)
  const { completeChaoxingLogin } = await import('../src/auth/chaoxingAuth')
  const first = completeChaoxingLogin()
  await expect(first).rejects.toThrow(status === 401 ? '超星登录已失效，请重新发起登录。' : '超星登录尚未配置，请联系管理员。')
  expect(completeChaoxingLogin()).toBe(first)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(mocks.setStudentSession).not.toHaveBeenCalled()
})

it.each([{}, { access_token: 'test-access' }, { access_token: '', refresh_token: 'test-refresh' }, { data: { access_token: 'test-access', refresh_token: 'test-refresh' } }])('rejects incomplete or undocumented handoff output', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)))
  const { completeChaoxingLogin } = await import('../src/auth/chaoxingAuth')
  await expect(completeChaoxingLogin()).rejects.toThrow('未返回有效会话')
  expect(mocks.setStudentSession).not.toHaveBeenCalled()
})

it('reports an unavailable service without printing transport details', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private cookie details')))
  const { getChaoxingLoginConfiguration } = await import('../src/auth/chaoxingAuth')
  await expect(getChaoxingLoginConfiguration()).rejects.toThrow('无法连接超星登录服务，请稍后重试。')
})
