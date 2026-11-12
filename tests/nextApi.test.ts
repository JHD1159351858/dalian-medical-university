import { afterEach, expect, it, vi } from 'vitest';
import { POST as chat } from '../src/app/api/chat/route';
import { GET as health } from '../src/app/api/health/route';
import { POST as tts } from '../src/app/api/tts/route';
import { POST as evaluate } from '../src/app/api/treatment-evaluation/route';

const post = (path: string, body: object) => new Request(`http://localhost/api/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const configure = () => {
  vi.stubEnv('OPENAPI_TOKEN', 'test-token');
  vi.stubEnv('PATIENT_BOT_ID', 'test-bot');
  vi.stubEnv('PATIENT_VOICE_ID', 'test-voice');
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('keeps fixed-case interviews available without external credentials', async () => {
  vi.stubEnv('OPENAPI_TOKEN', '');
  vi.stubEnv('PATIENT_BOT_ID', '');
  vi.stubEnv('PATIENT_VOICE_ID', '');
  expect(await (await health()).json()).toEqual({ configured: false, tts: false, interview: true });
  const upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
  const response = await chat(post('chat', { messages: [{ role: 'user', content: '哪里疼？' }], stream: true }));
  expect(response.status).toBe(200);
  const events = await response.text();
  expect(events).toContain('我左上腹痛。');
  expect(events).toContain('case_rules');
  expect(events).not.toMatch(/两三天|油腻/);
  expect(upstream).not.toHaveBeenCalled();
});

it('rejects conversations that do not end with the doctor’s question', async () => {
  const response = await chat(post('chat', { messages: [{ role: 'assistant', content: '您好。' }] }));
  expect(response.status).toBe(400);
});

it('keeps the upstream timeout active after returning a streaming response', async () => {
  configure();
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
  })));
  const response = await chat(post('chat', { messages: [{ role: 'user', content: '您平时做什么工作？' }], stream: true }));
  const content = response.text();
  await vi.advanceTimersByTimeAsync(45_000);
  expect(await content).toContain('聊天服务响应超时。');
});

it('cancels the upstream request when the browser stops reading the stream', async () => {
  configure();
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    signal = options?.signal;
    signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
  })));
  const response = await chat(post('chat', { messages: [{ role: 'user', content: '您平时做什么工作？' }], stream: true }));
  await response.body?.cancel();
  expect(signal?.aborted).toBe(true);
});

it('passes voice direction to Coze and separates the cached audio by direction', async () => {
  configure();
  const upstream = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(new Uint8Array([0x49, 0x44, 0x33])));
  vi.stubGlobal('fetch', upstream);
  for (const contextText of ['轻度腹痛不适。', '轻度腹痛不适。', '平静自然。']) {
    const response = await tts(post('tts', { text: '医生，我身体不舒服。', patientId: 'next-case-test', voiceId: 'patient-voice', emotion: 'sad', contextText, speed: 0.94 }));
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  }
  expect(upstream).toHaveBeenCalledTimes(2);
  const body: Record<string, unknown> = JSON.parse(String(upstream.mock.calls[0][1]?.body));
  expect(body).toMatchObject({ voice_id: 'patient-voice', context_texts: '轻度腹痛不适。', speed: 0.94 });
  expect(body).not.toHaveProperty('emotion');
});

it('evaluates treatment against the shared source case without claiming teacher approval', async () => {
  const response = await evaluate(post('treatment-evaluation', {
    caseId: 'wang-xu', diagnosis: {},
    plan: { treatments: [{ id: 'a', category: '护理', item: '观察病情' }], medications: [] },
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ basis: 'case_reference', teacherApproved: false, status: 'needs_revision', ai: { status: 'not_configured' } });
});
