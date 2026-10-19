import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const dev =
  process.env.CODER_PROJECT_ENV !== 'PROD' &&
  process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.DEPLOY_RUN_PORT || process.env.PORT || '5000', 10);

const SAMPLE_RATE = 24_000;
const MAX_TEXT_BYTES = 1_024;
const EMOTIONS = ['happy', 'sad', 'angry', 'surprised', 'fear', 'hate', 'excited', 'coldness', 'neutral'];

function speechUrl() {
  const base = process.env.OPENAPI_BASE_URL || 'https://api.coze.cn';
  const url = new URL(base);
  if (url.hostname === 'api.coze.cn') url.hostname = 'ws.coze.cn';
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.pathname = '/v1/audio/speech';
  url.search = '';
  return url;
}

function attachSpeechStream(server: ReturnType<typeof createServer>) {
  const socketServer = new WebSocketServer({ server, path: '/api/speech-stream', maxPayload: 8_192 });
  socketServer.on('connection', (client) => {
    let upstream: WebSocket | undefined;
    let state: 'idle' | 'connecting' | 'configuring' | 'ready' | 'finishing' | 'done' | 'failed' | 'closed' = 'idle';
    let textBytes = 0;
    let timer: NodeJS.Timeout | undefined;
    const timeoutMs = 45_000;

    const stopUpstream = () => {
      if (upstream?.readyState === WebSocket.CONNECTING) upstream.terminate();
      else if (upstream?.readyState === WebSocket.OPEN) upstream.close();
    };
    const sendClient = (message: Record<string, unknown>) => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
    };
    const fail = (error = '语音服务暂时不可用。') => {
      if (['done', 'failed', 'closed'].includes(state)) return;
      state = 'failed';
      clearTimeout(timer);
      sendClient({ type: 'error', error });
      client.close(1011);
      stopUpstream();
    };
    const resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => fail('语音服务响应超时。'), timeoutMs);
    };
    const sendUpstream = (event_type: string, data?: Record<string, unknown>) => {
      if (upstream?.readyState !== WebSocket.OPEN) return fail();
      upstream.send(JSON.stringify({ id: randomUUID(), event_type, ...(data ? { data } : {}) }));
    };

    resetTimeout();
    client.on('message', (raw, isBinary) => {
      if (['done', 'failed', 'closed'].includes(state)) return;
      let message: unknown;
      try {
        if (isBinary) return fail('语音消息格式无效。');
        message = JSON.parse(raw.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) return fail('语音消息格式无效。');
      } catch {
        return fail('语音消息格式无效。');
      }

      const msg = message as Record<string, unknown>;

      if (msg.type === 'start' && state === 'idle') {
        const voiceId = msg.voiceId ?? process.env.PATIENT_VOICE_ID;
        const speed = typeof msg.speed === 'number' && Number.isFinite(msg.speed) ? msg.speed : 0.95;
        const emotion = msg.emotion;
        const token = process.env.OPENAPI_TOKEN;
        if (typeof token !== 'string' || !token.trim()) return fail('语音服务尚未配置。');
        if (typeof voiceId !== 'string' || !voiceId.trim() || voiceId.length > 128 ||
          typeof speed !== 'number' || speed < 0.5 || speed > 2 ||
          (emotion !== undefined && !EMOTIONS.includes(String(emotion)))) return fail('语音配置无效。');

        state = 'connecting';
        try {
          upstream = new WebSocket(speechUrl(), {
            headers: { Authorization: `Bearer ${token.trim()}` },
            handshakeTimeout: timeoutMs,
            maxPayload: 4 * 1_024 * 1_024,
          });
        } catch {
          return fail();
        }
        upstream.on('message', (data) => {
          if (['done', 'failed', 'closed'].includes(state)) return;
          let event: { event_type?: string; data?: { delta?: string } };
          try { event = JSON.parse(data.toString()); } catch { return fail(); }
          resetTimeout();
          if (event?.event_type === 'speech.created' && state === 'connecting') {
            state = 'configuring';
            sendUpstream('speech.update', {
              output_audio: {
                codec: 'pcm', pcm_config: { sample_rate: SAMPLE_RATE, frame_size_ms: 100 },
                voice_id: voiceId.trim(), speech_rate: Math.round((speed - 1) * 100),
                ...(emotion ? { emotion_config: { emotion, emotion_scale: 4 } } : {}),
              },
            });
          } else if (event?.event_type === 'speech.updated' && state === 'configuring') {
            state = 'ready';
            sendClient({ type: 'ready', sampleRate: SAMPLE_RATE });
          } else if (event?.event_type === 'speech.audio.update' && ['ready', 'finishing'].includes(state)) {
            if (typeof event.data?.delta !== 'string') return fail();
            sendClient({ type: 'audio', data: event.data.delta });
          } else if (event?.event_type === 'speech.audio.completed' && state === 'finishing') {
            state = 'done';
            clearTimeout(timer);
            sendClient({ type: 'done' });
            client.close(1000);
            stopUpstream();
          } else if (event?.event_type === 'error') {
            fail();
          }
        });
        upstream.on('error', () => fail());
        upstream.on('close', () => fail());
        resetTimeout();
        return;
      }

      if (msg.type === 'append' && state === 'ready') {
        if (typeof msg.text !== 'string' || !msg.text.length) return fail('语音文本格式无效。');
        textBytes += Buffer.byteLength(msg.text, 'utf8');
        if (textBytes > MAX_TEXT_BYTES) return fail('语音文本超过长度限制。');
        sendUpstream('input_text_buffer.append', { delta: msg.text });
      } else if (msg.type === 'finish' && state === 'ready' && textBytes > 0) {
        state = 'finishing';
        sendUpstream('input_text_buffer.complete');
      } else {
        return fail('语音消息顺序无效。');
      }
      resetTimeout();
    });
    client.on('error', () => fail('语音消息格式无效。'));
    client.on('close', () => {
      state = 'closed';
      clearTimeout(timer);
      stopUpstream();
    });
  });
  return socketServer;
}

if (dev) {
  const toMB = (bytes: number) => Math.round(bytes / 1024 / 1024);
  setInterval(() => {
    const m = process.memoryUsage();
    console.log(
      `[mem] rss=${toMB(m.rss)}MB heapTotal=${toMB(m.heapTotal)}MB heapUsed=${toMB(
        m.heapUsed,
      )}MB external=${toMB(m.external)}MB native=${toMB(m.rss - m.heapTotal - m.external)}MB`,
    );
  }, 120_000).unref();
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  attachSpeechStream(server);
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.CODER_PROJECT_ENV
      }`,
    );
  });
});
