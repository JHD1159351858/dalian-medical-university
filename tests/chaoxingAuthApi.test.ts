import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../server/index.mjs';
import { chaoxingAuth, safeChaoxingNext } from '../server/chaoxingAuth.mjs';

const { bridge } = vi.hoisted(() => ({ bridge: vi.fn() }));
vi.mock('../server/chaoxingSupabaseBridge.mjs', async (original) => ({
  ...await original<typeof import('../server/chaoxingSupabaseBridge.mjs')>(),
  createChaoxingSupabaseSession: bridge,
}));

const servers: Server[] = [];
const site = 'https://hospital.example';
const tokens = { access_token: 'test-supabase-access', refresh_token: 'test-supabase-refresh' };
type Action = 'start' | 'callback' | 'config' | 'session' | 'logout';
type Adapter = 'express' | 'next';
const cookie = (response: Response) => response.headers.get('set-cookie')!.split(';')[0];

async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  return `http://127.0.0.1:${address.port}`;
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function harness(adapter: Adapter) {
  let verifiedIdentity: unknown = { uid: '12345', name: 'login-name', displayName: '测试学生', fid: '1385', role: [] };
  const verifications: Record<string, unknown>[] = [];
  const center = await listen(createServer(async (request, response) => {
    const value = await body(request);
    verifications.push(value);
    response.setHeader('content-type', 'application/json');
    response.statusCode = value.ticket === 'test-ticket' && value.secret === 'test-shared-secret' ? 200 : 410;
    response.end(JSON.stringify(response.statusCode === 200 ? verifiedIdentity : { error: 'Ticket expired or already used' }));
  }));
  const env = {
    SSO_CENTER_URL: center, APP_PUBLIC_URL: site, SSO_SHARED_SECRET: 'test-shared-secret', SSO_SESSION_SECRET: 'test-encryption-secret-with-at-least-32-characters', SSO_IDENTITY_SECRET: 'test-stable-identity-secret-with-at-least-32-characters',
    SUPABASE_URL: 'https://database.example', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_admin',
    CODER_SUPABASE_URL: '', CODER_SUPABASE_ANON_KEY: '', CODER_SUPABASE_TENANT_ID: '',
  };
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const app = adapter === 'express' ? await listen(createServer(createApp({ env }))) : site;
  const call = async (action: Action, query = '', headers: Record<string, string> = {}) => {
    const path = `/api/auth/chaoxing${action === 'start' ? '' : `/${action}`}${query}`;
    const request = new Request(`${app}${path}`, { method: action === 'session' ? 'POST' : 'GET', headers, redirect: 'manual' });
    if (adapter === 'express') return fetch(request);
    if (action === 'start') return (await import('../src/app/api/auth/chaoxing/route')).GET(request);
    if (action === 'callback') return (await import('../src/app/api/auth/chaoxing/callback/route')).GET(request);
    if (action === 'config') return (await import('../src/app/api/auth/chaoxing/config/route')).GET(request);
    if (action === 'logout') return (await import('../src/app/api/auth/chaoxing/logout/route')).GET(request);
    return (await import('../src/app/api/auth/chaoxing/session/route')).POST(request);
  };
  const start = async (next = '/training') => {
    const response = await call('start', `?next=${encodeURIComponent(next)}`);
    const target = new URL(response.headers.get('location')!);
    const callback = new URL(target.searchParams.get('return_to')!);
    return { response, target, callback, state: callback.searchParams.get('state')!, cookie: cookie(response) };
  };
  const success = async () => {
    const initial = await start('/training?tab=records');
    const response = await call('callback', `?state=${initial.state}&ticket=test-ticket`, { cookie: initial.cookie });
    return { initial, response, cookie: cookie(response) };
  };
  return { env, center, verifications, call, start, success, setIdentity: (value: unknown) => { verifiedIdentity = value; } };
}

beforeEach(() => { bridge.mockReset().mockResolvedValue(tokens); });
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

it.each(['express', 'next'] as const)('%s performs ticket verification and encrypted cookie handoff without tokens in the redirect URL', async (adapter) => {
  const h = await harness(adapter);
  expect(await (await h.call('config')).json()).toEqual({ available: true, message: '可使用超星账号登录。' });
  const { initial, response, cookie: handoff } = await h.success();
  expect(initial.response.status).toBe(302);
  expect(initial.target.pathname).toBe('/api/auth/chaoxing');
  expect(initial.callback.origin).toBe(site);
  expect(initial.callback.pathname).toBe('/api/auth/chaoxing/callback');
  expect(initial.response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax; Max-Age=300; Secure');
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe('/auth/chaoxing/callback');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(!handoff.includes(tokens.access_token) && !handoff.includes(tokens.refresh_token)).toBe(true);
  expect(h.verifications).toEqual([{ ticket: 'test-ticket', secret: 'test-shared-secret' }]);
  const bridgeArguments: unknown[] | undefined = bridge.mock.calls[0];
  expect(bridgeArguments?.[0]).toEqual({ issuer: h.center, subject: 'uid:12345', displayName: '测试学生' });
  const session = await h.call('session', '', { cookie: handoff, origin: site });
  expect(session.status).toBe(200);
  const sessionBody = await session.json() as Record<string, unknown>;
  expect(typeof sessionBody.access_token === 'string' && Boolean(sessionBody.access_token)).toBe(true);
  expect(typeof sessionBody.refresh_token === 'string' && Boolean(sessionBody.refresh_token)).toBe(true);
  expect(sessionBody.next).toBe('/training?tab=records');
  expect(session.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(session.headers.get('cache-control')).toBe('private, no-store');
});

it.each(['express', 'next'] as const)('%s rejects callbacks without the matching signed state cookie before consuming a ticket', async (adapter) => {
  const h = await harness(adapter);
  const initial = await h.start();
  const callbackHeaders: Record<string, string>[] = [{}, { cookie: initial.cookie }];
  for (const headers of callbackHeaders) {
    const response = await h.call('callback', '?state=wrong-state&ticket=test-ticket', headers);
    expect(response.headers.get('location')).toBe('/auth/chaoxing/callback?error=invalid_state');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  }
  expect(h.verifications).toHaveLength(0);
  expect(bridge).not.toHaveBeenCalled();
});

it.each(['express', 'next'] as const)('%s accepts only a top-level stable identity from the center', async (adapter) => {
  const h = await harness(adapter);
  h.setIdentity({ data: { uid: '12345', name: 'name' } });
  const result = await h.success();
  expect(result.response.headers.get('location')).toBe('/auth/chaoxing/callback?error=ticket_invalid');
  expect(bridge).not.toHaveBeenCalled();
  h.setIdentity({ name: 'same-name' });
  const noId = await h.success();
  expect(noId.response.headers.get('location')).toBe('/auth/chaoxing/callback?error=ticket_invalid');
});

it.each(['express', 'next'] as const)('%s requires a same-origin POST for session handoff and rejects missing or tampered cookies', async (adapter) => {
  const h = await harness(adapter);
  const completed = await h.success();
  for (const origin of ['', 'https://attacker.example']) expect((await h.call('session', '', { cookie: completed.cookie, origin })).status).toBe(403);
  expect((await h.call('session', '', { origin: site })).status).toBe(401);
  const parts = completed.cookie.split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  expect((await h.call('session', '', { cookie: parts.join('.'), origin: site })).status).toBe(401);
  expect((await h.call('session', '', { cookie: completed.cookie, origin: site })).status).toBe(200);
});

it.each(['express', 'next'] as const)('%s reports missing configuration and bridge failures without exposing credentials', async (adapter) => {
  const h = await harness(adapter);
  bridge.mockRejectedValue(new Error('private-upstream-token-and-service-key'));
  const failed = await h.success();
  expect(failed.response.headers.get('location')).toBe('/auth/chaoxing/callback?error=session_failed');
  expect(await failed.response.text()).not.toContain('private-upstream');
  h.env.SUPABASE_SERVICE_ROLE_KEY = '';
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  const config = await h.call('config');
  expect(await config.json()).toEqual({ available: false, message: '超星登录尚未配置完成，请联系管理员。' });
  expect((await h.call('start')).status).toBe(503);
  expect((await h.call('session', '', { origin: site })).status).toBe(503);
});

it.each(['express', 'next'] as const)('%s logs out through the existing center and keeps the return address on this site', async (adapter) => {
  const h = await harness(adapter);
  const response = await h.call('logout', '?next=%2F%2Fevil.example');
  const location = new URL(response.headers.get('location')!);
  expect(location.origin).toBe(h.center);
  expect(location.pathname).toBe('/logout');
  expect(location.searchParams.get('return_to')).toBe(`${site}/`);
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});

it('rejects expired state and handoff contexts without exposing their contents', async () => {
  const h = await harness('next');
  const now = 1_000_000;
  const start = await chaoxingAuth({ action: 'start', method: 'GET', url: `${site}/api/auth/chaoxing`, headers: new Headers() }, { env: h.env, now: () => now });
  const target = new URL(start.headers.location);
  const state = new URL(target.searchParams.get('return_to')!).searchParams.get('state')!;
  const contextCookie = start.headers['set-cookie'].split(';')[0];
  const callback = { action: 'callback', method: 'GET', url: `${site}/api/auth/chaoxing/callback?state=${state}&ticket=test-ticket`, headers: new Headers({ cookie: contextCookie }) };
  const expired = await chaoxingAuth(callback, { env: h.env, now: () => now + 301_000 });
  expect(expired.headers.location).toContain('error=invalid_state');
  const success = await chaoxingAuth(callback, { env: h.env, now: () => now });
  const response = await chaoxingAuth({ action: 'session', method: 'POST', url: `${site}/api/auth/chaoxing/session`, headers: new Headers({ origin: site, cookie: success.headers['set-cookie'].split(';')[0] }) }, { env: h.env, now: () => now + 91_000 });
  expect(response.status).toBe(401);
});

it('forbids redirects when sending the shared secret and times out stalled verification', async () => {
  const h = await harness('next');
  const initial = await h.start();
  const request = { action: 'callback', method: 'GET', url: `${site}/api/auth/chaoxing/callback?state=${initial.state}&ticket=test-ticket`, headers: new Headers({ cookie: initial.cookie }) };
  let redirectForbidden = false;
  const fetchRedirect: typeof fetch = async (_input, init) => {
    redirectForbidden = init?.redirect === 'error';
    return new Response(null, { status: 307, headers: { location: 'https://attacker.example' } });
  };
  const redirect = await chaoxingAuth(request, { env: h.env, fetchImpl: fetchRedirect });
  expect(redirectForbidden).toBe(true);
  expect(redirect.headers.location).toContain('error=ticket_invalid');
  const stalledFetch: typeof fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const timeout = await chaoxingAuth(request, { env: h.env, fetchImpl: stalledFetch, timeoutMs: 10 });
  expect(timeout.headers.location).toContain('error=ticket_invalid');
  expect(bridge).not.toHaveBeenCalled();
});

it.each(['//evil.example', '/safe/..//evil.example', '/%2e%2e//evil.example', '/%5cevil.example', '/%0d%0aLocation:evil', 'https://evil.example', '/auth/chaoxing/callback', '/auth/chaoxing/callback/', '/api/auth/chaoxing/session'])('rejects unsafe next destination %s', (next) => {
  expect(safeChaoxingNext(next, site)).toBe('/training');
});

it('keeps safe relative return paths after URL normalization', () => {
  expect(safeChaoxingNext('/safe/../training?tab=records#saved', site)).toBe('/training?tab=records#saved');
});
