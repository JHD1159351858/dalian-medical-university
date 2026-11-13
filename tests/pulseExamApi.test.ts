import { createServer, type Server } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { createApp } from '../server/index.mjs';

const servers: Server[] = [];
type Adapter = 'express' | 'next';

async function call(adapter: Adapter, method: 'GET' | 'POST', caseId: string, selected?: unknown) {
  const path = `/api/pulse-exam?caseId=${encodeURIComponent(caseId)}`;
  const body = JSON.stringify({ caseId, selected });
  if (adapter === 'next') {
    const route = await import('../src/app/api/pulse-exam/route');
    const request = new Request(`http://localhost${path}`, method === 'GET' ? undefined : {
      method, headers: { 'content-type': 'application/json' }, body,
    });
    return method === 'GET' ? route.GET(request) : route.POST(request);
  }
  const server = createServer(createApp({ env: {} }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  return fetch(`http://127.0.0.1:${address.port}${path}`, method === 'GET' ? undefined : {
    method, headers: { 'content-type': 'application/json' }, body,
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

it('returns the same clues and unselected 28 pulse options from both routes without leaking the standard answer', async () => {
  const outputs: unknown[] = [];
  for (const adapter of ['express', 'next'] as const) {
    const response = await call(adapter, 'GET', 'wang-xu');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['caseId', 'options', 'positions']);
    expect(body.caseId).toBe('wang-xu');
    expect(body.options).toHaveLength(28);
    expect(new Set(body.options).size).toBe(28);
    expect(body.positions).toMatchObject({ index: { label: '寸' }, middle: { label: '关' }, ring: { label: '尺' } });
    for (const position of Object.values(body.positions) as Array<{ label: string; light: string; deep: string }>) {
      expect(Object.keys(position).sort()).toEqual(['deep', 'label', 'light']);
      expect(position.light).toContain('不易触及');
      expect(position.deep).toContain('较深处');
    }
    expect(JSON.stringify(body)).not.toMatch(/standardAnswer|studentAnswer|explanation|expected|selected/);
    outputs.push(body);
  }
  expect(outputs[0]).toEqual(outputs[1]);
});

it('reveals the standard and grades a correct unordered selection consistently', async () => {
  const outputs: unknown[] = [];
  for (const adapter of ['express', 'next'] as const) {
    const response = await call(adapter, 'POST', 'wang-xu', ['数', '沉', '滑', '沉']);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ correct: true, standardAnswer: ['沉', '滑', '数'], studentAnswer: ['数', '沉', '滑'], missed: [], extra: [] });
    expect(Object.keys(body.explanation).sort()).toEqual(['数', '沉', '滑'].sort());
    outputs.push(body);
  }
  expect(outputs[0]).toEqual(outputs[1]);
});

it('distinguishes missed and extra pulse judgments after submission', async () => {
  for (const adapter of ['express', 'next'] as const) {
    const response = await call(adapter, 'POST', 'wang-xu', ['沉', '浮']);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ correct: false, studentAnswer: ['沉', '浮'], missed: ['滑', '数'], extra: ['浮'] });
  }
});

it('rejects empty or invalid selections and unknown cases consistently without returning the answer', async () => {
  for (const adapter of ['express', 'next'] as const) {
    for (const selected of [undefined, [], ['未知'], '沉滑数', [123]]) {
      const response = await call(adapter, 'POST', 'wang-xu', selected);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: '请至少选择一种有效脉象。' });
    }
    for (const method of ['GET', 'POST'] as const) {
      const response = await call(adapter, method, '__proto__', ['沉']);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: '未找到该病例的脉诊练习。' });
    }
  }
});
