import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../server/index.mjs';
import { recordsConfiguration } from '../server/encounterRecords.mjs';
import trainingCases from '../server/training-cases.json';

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

async function harness(adapter: Adapter, configured = true, platformTenant?: string) {
  const rows = new Map<string, Row>();
  const authCalls: string[] = [];
  const databaseCalls: URL[] = [];
  const base = await listen(createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://localhost');
    const token = request.headers.authorization;
    const owner = token === 'Bearer alice-token' ? alice : token === 'Bearer bob-token' ? bob : null;
    expect(request.headers.apikey).toBe('sb_publishable_test');
    expect(request.headers['x-instance-id']).toBe(platformTenant || undefined);
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
  const platform = platformTenant !== undefined;
  const env = {
    SUPABASE_URL: configured && !platform ? base : '', SUPABASE_PUBLISHABLE_KEY: configured && !platform ? 'sb_publishable_test' : '', SUPABASE_ANON_KEY: '',
    CODER_SUPABASE_URL: configured && platform ? base : '', CODER_SUPABASE_ANON_KEY: configured && platform ? 'sb_publishable_test' : '', CODER_SUPABASE_TENANT_ID: platformTenant ?? '',
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const app = adapter === 'express' ? await listen(createServer(createApp({ env }))) : 'http://localhost';
  const call = async (method: 'GET' | 'PUT', query = '', body?: unknown, token: string | null = 'alice-token', forwardedHeaders: Record<string, string> = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...forwardedHeaders };
    if (token) headers.authorization = `Bearer ${token}`;
    const request = new Request(`${app}/api/encounters${query}`, { method, headers, ...(method === 'PUT' ? { body: JSON.stringify(body) } : {}) });
    if (adapter === 'express') return fetch(request);
    const route = await import('../src/app/api/encounters/route');
    return method === 'GET' ? route.GET(request) : route.PUT(request);
  };
  const config = async () => adapter === 'express' ? fetch(`${app}/api/records-config`) : (await import('../src/app/api/records-config/route')).GET();
  return { rows, authCalls, databaseCalls, env, call, app, config };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

it.each(['express', 'next'] as const)('%s routes platform sessions and records through the configured tenant', async (adapter) => {
  const h = await harness(adapter, true, 'hospital-tenant');
  expect(await (await h.config()).json()).toEqual({ url: h.env.CODER_SUPABASE_URL, publishableKey: 'sb_publishable_test', tenantId: 'hospital-tenant' });
  const forwarded = { 'x-sandbox-authorization': 'Bearer alice-token' };
  expect((await h.call('PUT', '', encounter(), null, forwarded)).status).toBe(200);
  const detail = await h.call('GET', `?id=${recordId}`, undefined, 'bob-token', forwarded);
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({ record: { id: recordId } });
  expect(h.authCalls).toEqual(['Bearer alice-token', 'Bearer alice-token']);
  expect(h.rows.get(recordId)?.student_id).toBe(alice);
});

it.each(['express', 'next'] as const)('%s never falls back to a direct token when a platform header is present but invalid', async (adapter) => {
  const h = await harness(adapter);
  for (const value of ['', 'not-a-bearer', 'Bearer invalid']) {
    const response = await h.call('GET', '', undefined, 'alice-token', { 'x-sandbox-authorization': value });
    expect(response.status).toBe(401);
  }
  expect(h.authCalls).toEqual(['Bearer invalid']);
  expect(h.databaseCalls).toHaveLength(0);
});

it('keeps configuration families together and never combines a legacy URL with a platform key', () => {
  const platform = { CODER_SUPABASE_URL: 'https://platform.example', CODER_SUPABASE_ANON_KEY: 'sb_publishable_platform', CODER_SUPABASE_TENANT_ID: 'hospital-tenant' };
  expect(recordsConfiguration(platform)).toMatchObject({ status: 200, body: { url: 'https://platform.example', publishableKey: 'sb_publishable_platform', tenantId: 'hospital-tenant' } });
  expect(recordsConfiguration({ ...platform, SUPABASE_URL: 'https://legacy.example' }).status).toBe(503);
  expect(recordsConfiguration({ ...platform, SUPABASE_ANON_KEY: 'sb_publishable_legacy' }).status).toBe(503);
  expect(recordsConfiguration({ ...platform, SUPABASE_URL: 'https://legacy.example', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_legacy' })).toEqual({ status: 200, body: { url: 'https://legacy.example', publishableKey: 'sb_publishable_legacy' } });
  for (const key of ['sb_secret_forbidden', 'invalid']) expect(recordsConfiguration({ ...platform, CODER_SUPABASE_ANON_KEY: key }).status).toBe(503);
  expect(recordsConfiguration({ ...platform, CODER_SUPABASE_TENANT_ID: 'invalid\r\nheader' }).status).toBe(503);
});

it.each(['express', 'next'] as const)('%s saves a completed partial case without requiring evaluation or filled fields', async (adapter) => {
  const h = await harness(adapter);
  const partial = {
    ...encounter(), status: 'completed', endedAt: '2026-11-13T02:00:00.000Z',
    snapshot: {
      ...encounter().snapshot, fourDiagnosis: { look: '薄白苔' },
      treatment: {
        treatments: [{ id: 't1', category: '护理', item: '学生已填写的内容' }],
        medications: [{ id: 'm1', name: '学生药名', route: '', dose: '' }],
      },
    },
    submissions: [{ id: '44444444-4444-4444-8444-444444444444', kind: 'treatment', at: '2026-11-13T02:00:00.000Z', payload: { completed: true } }],
  };
  expect((await h.call('PUT', '', partial)).status).toBe(200);
  const response = await h.call('GET', `?id=${recordId}`);
  expect(await response.json()).toMatchObject({ record: { status: 'completed', snapshot: partial.snapshot, submissions: partial.submissions } });
  expect(h.rows.get(recordId)?.student_id).toBe(alice);
});

it('round-trips case-specific bedside actions and rejects malformed findings', async () => {
  const h = await harness('express');
  const { id: caseId, name, age, sex } = trainingCases[0];
  const examId = '神经系统查体';
  const action = { examId, action: '观察双侧瞳孔', finding: '瞳孔等大等圆', at: 12345 };
  const physicalExam = { orderedIds: [examId], notes: { [examId]: '学生所见' }, submittedNotes: {}, history: [], bedsideHistory: [action] };
  const snapshot = { ...encounter().snapshot, physicalExam, auxiliaryOrderedIds: ['ultrasound'] };
  const record = { ...encounter(), caseId, patient: { name, age, sex }, snapshot };
  expect((await h.call('PUT', '', record)).status).toBe(200);
  expect((await (await h.call('GET', '?id=' + recordId)).json()).record.snapshot).toEqual(snapshot);
  expect((await h.call('PUT', '', { ...record, snapshot: { ...snapshot, auxiliaryOrderedIds: [123] } })).status).toBe(400);
  expect((await h.call('PUT', '', { ...record, snapshot: { ...snapshot, physicalExam: { ...physicalExam, bedsideHistory: [{ ...action, finding: 123 }] } } })).status).toBe(400);
});

it.each(['express', 'next'] as const)('%s rejects missing or invalid sessions before accessing records', async (adapter) => {
  const h = await harness(adapter);
  expect((await h.call('GET', '', undefined, null)).status).toBe(401);
  expect((await h.call('GET', '', undefined, 'invalid')).status).toBe(401);
  expect(h.authCalls).toEqual(['Bearer invalid']);
  expect(h.databaseCalls).toHaveLength(0);
});

it.each(['express', 'next'] as const)('%s saves the selected training patient and rejects inconsistent metadata', async (adapter) => {
  const h = await harness(adapter);
  const { id: caseId, name, age, sex } = trainingCases[0];
  expect((await h.call('PUT', '', { ...encounter(), caseId })).status).toBe(400);
  const wrongScore = { id: '44444444-4444-4444-8444-444444444444', kind: 'treatment', at: encounter().startedAt, payload: { caseAssessment: { caseId: 'wang-xu' } } };
  expect((await h.call('PUT', '', { ...encounter(), caseId, patient: { name, age, sex }, submissions: [wrongScore] })).status).toBe(400);
  expect((await h.call('PUT', '', { ...encounter(), caseId, patient: { name, age, sex } })).status).toBe(200);
  expect((await (await h.call('GET', '?id=' + recordId)).json()).record).toMatchObject({ caseId, patient: { name, age, sex } });
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
