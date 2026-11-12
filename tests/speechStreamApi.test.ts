import { createServer, type Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import * as api from '../server/index.mjs';

const servers: Server[] = [];
const socketServers: WebSocketServer[] = [];
const sockets: WebSocket[] = [];

async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

function inbox(socket: WebSocket) {
  const messages: any[] = [];
  const waiters: ((message: any) => void)[] = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    const resolve = waiters.shift();
    if (resolve) resolve(message);
    else messages.push(message);
  });
  return () => new Promise<any>((resolve, reject) => {
    if (messages.length) return resolve(messages.shift());
    const timer = setTimeout(() => reject(new Error('WebSocket message timed out')), 1_500);
    waiters.push((message) => { clearTimeout(timer); resolve(message); });
  });
}

async function startApp(env: Record<string, string> = {}, timeoutMs = 1_000) {
  expect(api.attachSpeechStream).toBeTypeOf('function');
  const server = createServer(api.createApp({ env }));
  socketServers.push(api.attachSpeechStream(server, { env, timeoutMs }));
  const url = await listen(server);
  const socket = new WebSocket(`${url.replace('http:', 'ws:')}/api/speech-stream`);
  sockets.push(socket);
  const next = inbox(socket);
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return { socket, next };
}

async function startUpstream(handler: (socket: WebSocket, authorization: string) => void) {
  const server = createServer();
  const wsServer = new WebSocketServer({ server, path: '/v1/audio/speech' });
  socketServers.push(wsServer);
  wsServer.on('connection', (socket, request) => {
    sockets.push(socket);
    handler(socket, String(request.headers.authorization));
  });
  return listen(server);
}

const send = (socket: WebSocket, message: unknown) => socket.send(JSON.stringify(message));
const configured = (base: string) => ({ OPENAPI_BASE_URL: base, OPENAPI_TOKEN: 'test-secret', PATIENT_VOICE_ID: 'default-voice' });

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(socketServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('bidirectional Coze speech proxy', () => {
  it('leaves other WebSocket upgrade paths available to Next.js', async () => {
    const server = createServer();
    socketServers.push(api.attachSpeechStream(server, { env: {} }));
    const other = new WebSocketServer({ noServer: true });
    socketServers.push(other);
    server.on('upgrade', (request, socket, head) => {
      if (request.url !== '/_next/hmr') return;
      other.handleUpgrade(request, socket, head, (connection) => {
        sockets.push(connection);
        connection.send('next-ready');
      });
    });
    const url = await listen(server);
    const socket = new WebSocket(`${url.replace('http:', 'ws:')}/_next/hmr`);
    sockets.push(socket);
    const message = await new Promise<string>((resolve, reject) => {
      socket.once('message', (raw) => resolve(raw.toString()));
      socket.once('error', reject);
    });
    expect(message).toBe('next-ready');
  });

  it('authenticates server-side, configures PCM, and forwards audio before input completion', async () => {
    const received: any[] = [];
    let authorization = '';
    const base = await startUpstream((upstream, header) => {
      authorization = header;
      upstream.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        received.push(message);
        if (message.event_type === 'speech.update') send(upstream, { event_type: 'speech.updated' });
        if (message.event_type === 'input_text_buffer.append') send(upstream, { event_type: 'speech.audio.update', data: { delta: 'AAABAA==' } });
        if (message.event_type === 'input_text_buffer.complete') {
          send(upstream, { event_type: 'input_text_buffer.completed' });
          send(upstream, { event_type: 'speech.audio.completed' });
        }
      });
      send(upstream, { event_type: 'speech.created' });
    });
    const { socket, next } = await startApp(configured(base));
    send(socket, { type: 'start', voiceId: 'patient-voice', speed: 0.95, emotion: 'sad' });
    expect(await next()).toEqual({ type: 'ready', sampleRate: 24_000 });
    expect(authorization).toBe('Bearer test-secret');
    expect(received[0]).toMatchObject({
      event_type: 'speech.update',
      data: { output_audio: { codec: 'pcm', pcm_config: { sample_rate: 24_000 }, voice_id: 'patient-voice', speech_rate: -5, emotion_config: { emotion: 'sad', emotion_scale: 4 } } },
    });
    send(socket, { type: 'append', text: '我这里疼。' });
    expect(await next()).toEqual({ type: 'audio', data: 'AAABAA==' });
    expect(received.map((event) => event.event_type)).toEqual(['speech.update', 'input_text_buffer.append']);
    send(socket, { type: 'finish' });
    expect(await next()).toEqual({ type: 'done' });
    expect(received[1].data).toEqual({ delta: '我这里疼。' });
    expect(received.every((event) => typeof event.id === 'string' && event.id)).toBe(true);
  });

  it('forwards the patient voice direction in bidirectional speech configuration', async () => {
    const received: any[] = [];
    const base = await startUpstream((upstream) => {
      upstream.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        received.push(message);
        if (message.event_type === 'speech.update') send(upstream, { event_type: 'speech.updated' });
      });
      send(upstream, { event_type: 'speech.created' });
    });
    const { socket, next } = await startApp(configured(base));
    send(socket, { type: 'start', voiceId: '7568423452617588790', speed: 0.94, contextText: '成年男声，轻度腹痛不适。', emotion: 'sad' });
    expect(await next()).toEqual({ type: 'ready', sampleRate: 24_000 });
    expect(received[0].data.output_audio).toMatchObject({
      voice_id: '7568423452617588790', speech_rate: -6, context_texts: '成年男声，轻度腹痛不适。',
    });
    expect(received[0].data.output_audio).not.toHaveProperty('emotion_config');
  });

  it('rejects input before readiness without creating an upstream connection', async () => {
    let connections = 0;
    const base = await startUpstream(() => { connections += 1; });
    const { socket, next } = await startApp(configured(base));
    send(socket, { type: 'append', text: '你好' });
    expect(await next()).toEqual({ type: 'error', error: '语音消息顺序无效。' });
    expect(connections).toBe(0);
  });

  it('returns a safe error when the server has no speech token', async () => {
    const { socket, next } = await startApp();
    send(socket, { type: 'start', voiceId: 'patient-voice' });
    expect(await next()).toEqual({ type: 'error', error: '语音服务尚未配置。' });
  });

  it('enforces the 1024-byte UTF-8 text limit across streamed appends', async () => {
    const received: any[] = [];
    const base = await startUpstream((upstream) => {
      upstream.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        received.push(message);
        if (message.event_type === 'speech.update') send(upstream, { event_type: 'speech.updated' });
      });
      send(upstream, { event_type: 'speech.created' });
    });
    const { socket, next } = await startApp(configured(base));
    send(socket, { type: 'start' });
    await next();
    send(socket, { type: 'append', text: '疼'.repeat(341) });
    send(socket, { type: 'append', text: '痛' });
    expect(await next()).toEqual({ type: 'error', error: '语音文本超过长度限制。' });
    expect(received.filter((event) => event.event_type === 'input_text_buffer.append')).toHaveLength(1);
  });

  it('closes the upstream when the browser cancels playback', async () => {
    let resolveClosed: () => void;
    const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
    const base = await startUpstream((upstream) => {
      upstream.once('close', () => resolveClosed());
      upstream.on('message', () => send(upstream, { event_type: 'speech.updated' }));
      send(upstream, { event_type: 'speech.created' });
    });
    const { socket, next } = await startApp(configured(base));
    send(socket, { type: 'start' });
    await next();
    socket.close();
    await closed;
  });

  it('hides upstream error details and token information', async () => {
    const base = await startUpstream((upstream) => send(upstream, { event_type: 'error', data: { code: 1, msg: 'Bearer test-secret: internal failure' } }));
    const { socket, next } = await startApp(configured(base));
    send(socket, { type: 'start' });
    expect(await next()).toEqual({ type: 'error', error: '语音服务暂时不可用。' });
  });

  it('ends a connection that does not complete its speech configuration', async () => {
    const base = await startUpstream(() => {});
    const { socket, next } = await startApp(configured(base), 30);
    send(socket, { type: 'start' });
    expect(await next()).toEqual({ type: 'error', error: '语音服务响应超时。' });
  });

  it('rejects duplicate completion and never forwards it twice', async () => {
    const received: any[] = [];
    const base = await startUpstream((upstream) => {
      upstream.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        received.push(message);
        if (message.event_type === 'speech.update') send(upstream, { event_type: 'speech.updated' });
      });
      send(upstream, { event_type: 'speech.created' });
    });
    const { socket, next } = await startApp(configured(base));
    send(socket, { type: 'start' });
    await next();
    send(socket, { type: 'append', text: '疼。' });
    send(socket, { type: 'finish' });
    send(socket, { type: 'finish' });
    expect(await next()).toEqual({ type: 'error', error: '语音消息顺序无效。' });
    expect(received.filter((event) => event.event_type === 'input_text_buffer.complete')).toHaveLength(1);
  });
});
