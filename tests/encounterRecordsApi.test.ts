import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../server/index.mjs';

const servers: Server[] = [];
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const recordId = '33333333-3333-4333-8333-333333333333';
type Adapter = 'express' | 'next';
type Row = Record<string, unknown> & { id: string; student_id: string };

const encounter = () => ({
  id: recordId, caseId: 'wang-xu', patient: { name: '王旭', age: 48, sex: '男' },
  startedAt: '2026-11-13T01:00:00.000Z', endedAt: null, status: 'in_progress',
  snapshot: { messages: [{ role: 'assistant', content: '医生，我身体不舒服。您帮我看看吧。' }], fourDiagnosis: {}, auxiliaryExam: {}, clinicalDiagnosis: {}, treatment: { treatments: [], medications: [] }, physicalExam: null },
  submissions: [],
});

async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

async function jsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

async function harness(adapter: Adapter, configured = true) {
  const rows = new Map<string, Row>();
  const authCalls: string[] = [];
  const databaseCalls: URL[] = [];
  const base = await listen(createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://localhost');
    const token = request.headers.authorization;
    const owner = token === 'Bearer alice-token' ? alice : token === 'Bearer bob-token' ? bob : null;
    expect(request.headers.apikey).toBe('sb_publishable_test');
    if (url.pathname === '/auth/v1/user') {
      authCalls.push(String(token));
      response.statusCode = owner ? 200 : 401;
      response.end(JSON.stringify(owner ? { id: owner } : { error: 'invalid token' }));
      return;
    }
    databaseCalls.push(url);
    if (!owner) { response.statusCode = 401; response.end('{}'); return; }
    if (request.method === 'POST') {
      const row = await jsonBody(request) as Row;
      expect(url.searchParams.get('on_conflict')).toBe('id');
      expect(request.headers.prefer).toBe('resolution=merge-duplicates,return=representation');
      expect(row.student_id).toBe(owner);
      expect(row).not.toHaveProperty('updated_at');
      if (rows.has(row.id) && rows.get(row.id)?.student_id !== owner) {
        response.statusCode = 403; response.end('{"code":"42501","message":"private upstream detail"}'); return;
      }
      rows.set(row.id, { ...row, updated_at: '2026-11-13T02:00:00.000Z' });
      response.end(JSON.stringify([rows.get(row.id)]));
      return;
    }
    expect(url.searchParams.get('student_id')).toBe(`eq.${owner}`);
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const visible = [...rows.values()].filter((row) => row.student_id === owner && (!id || row.id === id));
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? visible.length);
    response.end(JSON.stringify(visible.slice(offset, offset + limit)));
  }));
  const env = { SUPABASE_URL: configured ? base : '', SUPABASE_PUBLISHABLE_KEY: configured ? 'sb_publishable_test' : '', SUPABASE_ANON_KEY: '' };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const app = adapter === 'express' ? await listen(createServer(createApp({ env }))) : 'http://localhost';
  const call = async (method: 'GET' | 'PUT', query = '', body?: unknown, token: string | null = 'alice-token') => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const request = new Request(`${app}/api/encounters${query}`, { method, headers, ...(method === 'PUT' ? { body: JSON.stringify(body) } : {}) });
    if (adapter === 'express') return fetch(request);
    const route = await import('../src/app/api/encounters/route');
    return method === 'GET' ? route.GET(request) : route.PUT(request);
  };
  return { rows, authCalls, databaseCalls, env, call, app };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

it.each(['express', 'next'] as const)('%s rejects missing or invalid sessions before accessing records', async (adapter) => {
  const h = await harness(adapter);
  expect((await h.call('GET', '', undefined, null)).status).toBe(401);
  expect((await h.call('GET', '', undefined, 'invalid')).status).toBe(401);
  expect(h.authCalls).toEqual(['Bearer invalid']);
  expect(h.databaseCalls).toHaveLength(0);
});

it.each(['express', 'next'] as const)('%s upserts one owned record, assigns the authenticated owner and returns camelCase data', async (adapter) => {
  const h = await harness(adapter);
  for (const content of ['第一次记录', '更新后的记录']) {
    const body = encounter();
    body.snapshot.messages[0].content = content;
    const response = await h.call('PUT', '', { ...body, studentId: bob, updatedAt: '1900-01-01T00:00:00Z' });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ record: { id: recordId, updatedAt: '2026-11-13T02:00:00.000Z', patient: body.patient } });
  }
  expect(h.rows.size).toBe(1);
  const detail = await h.call('GET', `?id=${recordId}`);
  expect(detail.headers.get('cache-control')).toBe('private, no-store');
  const saved = await detail.json();
  expect(saved.record.snapshot.messages[0].content).toBe('更新后的记录');
  expect(saved.record).not.toHaveProperty('student_id');
  expect(h.authCalls).toHaveLength(3);
});

it.each(['express', 'next'] as const)('%s denies another student’s read and update using the same bearer at the database', async (adapter) => {
  const h = await harness(adapter);
  expect((await h.call('PUT', '', encounter())).status).toBe(200);
  expect((await h.call('GET', `?id=${recordId}`, undefined, 'bob-token')).status).toBe(404);
  const denied = await h.call('PUT', '', encounter(), 'bob-token');
  expect(denied.status).toBe(403);
  expect(await denied.text()).not.toContain('private upstream detail');
  const list = await h.call('GET', '', undefined, 'bob-token');
  expect(await list.json()).toEqual({ records: [], hasMore: false });
  expect(h.rows.get(recordId)?.student_id).toBe(alice);
});

it.each(['express', 'next'] as const)('%s lists fifty summaries per page without full snapshots', async (adapter) => {
  const h = await harness(adapter);
  for (let index = 0; index < 51; index += 1) {
    const id = `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`;
    h.rows.set(id, { id, student_id: alice, case_id: 'wang-xu', patient_name: '王旭', patient_age: 48, patient_sex: '男', started_at: encounter().startedAt, ended_at: null, status: 'in_progress', snapshot: encounter().snapshot, submissions: [], updated_at: '2026-11-13T02:00:00.000Z' });
  }
  const first = await (await h.call('GET')).json();
  expect(first.records).toHaveLength(50);
  expect(first.hasMore).toBe(true);
  expect(first.records[0]).not.toHaveProperty('snapshot');
  expect(first.records[0]).not.toHaveProperty('submissions');
  expect(h.databaseCalls.at(-1)?.searchParams.get('limit')).toBe('51');
  const last = await (await h.call('GET', '?offset=50')).json();
  expect(last.records).toHaveLength(1);
  expect(last.hasMore).toBe(false);
});

it.each(['express', 'next'] as const)('%s validates record structure, ids, query offsets and the 512KB body limit', async (adapter) => {
  const h = await harness(adapter);
  expect((await h.call('PUT', '', { ...encounter(), id: 'invalid' })).status).toBe(400);
  expect((await h.call('PUT', '', { ...encounter(), snapshot: { ...encounter().snapshot, messages: [{ role: 'system', content: 'invalid' }] } })).status).toBe(400);
  expect((await h.call('GET', '?offset=-1')).status).toBe(400);
  expect((await h.call('GET', '?id=invalid')).status).toBe(400);
  expect((await h.call('PUT', '', { ...encounter(), extra: 'x'.repeat(512 * 1024) })).status).toBe(413);
  expect(h.rows.size).toBe(0);
});

it.each(['express', 'next'] as const)('%s reports unavailable cloud configuration without pretending to save', async (adapter) => {
  const h = await harness(adapter, false);
  expect((await h.call('GET')).status).toBe(503);
  expect((await h.call('PUT', '', encounter())).status).toBe(503);
  expect(h.authCalls).toHaveLength(0);
});

it('exposes only safe public keys through records-config and rejects elevated keys', async () => {
  const { GET } = await import('../src/app/api/records-config/route');
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  expect(await (await GET()).json()).toEqual({ url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' });
  const jwt = (role: string) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  for (const key of ['sb_secret_forbidden', jwt('service_role')]) {
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', key);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(key);
  }
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '');
  vi.stubEnv('SUPABASE_ANON_KEY', jwt('anon'));
  expect((await GET()).status).toBe(200);
});
