import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const MAX_TEXT_BYTES = 1_024;
const SAMPLE_RATE = 24_000;
const EMOTIONS = ['happy', 'sad', 'angry', 'surprised', 'fear', 'hate', 'excited', 'coldness', 'neutral'];

function speechUrl(env) {
  const url = new URL(env.OPENAPI_BASE_URL || 'https://api.coze.cn');
  if (url.hostname === 'api.coze.cn') url.hostname = 'ws.coze.cn';
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.pathname = '/v1/audio/speech';
  url.search = '';
  return url;
}

export function attachSpeechStream(server, { env = process.env, timeoutMs = 45_000 } = {}) {
  const socketServer = new WebSocketServer({ server, path: '/api/speech-stream', maxPayload: 8_192 });
  socketServer.on('connection', (client) => {
    let upstream;
    let state = 'idle';
    let textBytes = 0;
    let timer;

    const stopUpstream = () => {
      if (upstream?.readyState === WebSocket.CONNECTING) upstream.terminate();
      else if (upstream?.readyState === WebSocket.OPEN) upstream.close();
    };
    const sendClient = (message) => {
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
    const sendUpstream = (event_type, data) => {
      if (upstream?.readyState !== WebSocket.OPEN) return fail();
      upstream.send(JSON.stringify({ id: randomUUID(), event_type, ...(data ? { data } : {}) }));
    };

    resetTimeout();
    client.on('message', (raw, isBinary) => {
      if (['done', 'failed', 'closed'].includes(state)) return;
      let message;
      try {
        if (isBinary) return fail('语音消息格式无效。');
        message = JSON.parse(raw.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) return fail('语音消息格式无效。');
      } catch {
        return fail('语音消息格式无效。');
      }

      if (message.type === 'start' && state === 'idle') {
        const voiceId = message.voiceId ?? env.PATIENT_VOICE_ID;
        const speed = message.speed ?? 0.95;
        const emotion = message.emotion;
        if (typeof env.OPENAPI_TOKEN !== 'string' || !env.OPENAPI_TOKEN.trim()) return fail('语音服务尚未配置。');
        if (typeof voiceId !== 'string' || !voiceId.trim() || voiceId.length > 128 ||
          typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.5 || speed > 2 ||
          (emotion !== undefined && !EMOTIONS.includes(emotion))) return fail('语音配置无效。');

        state = 'connecting';
        try {
          upstream = new WebSocket(speechUrl(env), {
            headers: { Authorization: `Bearer ${env.OPENAPI_TOKEN.trim()}` },
            handshakeTimeout: timeoutMs,
            maxPayload: 4 * 1_024 * 1_024,
          });
        } catch {
          return fail();
        }
        upstream.on('message', (data) => {
          if (['done', 'failed', 'closed'].includes(state)) return;
          let event;
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

      if (message.type === 'append' && state === 'ready') {
        if (typeof message.text !== 'string' || !message.text.length) return fail('语音文本格式无效。');
        textBytes += Buffer.byteLength(message.text, 'utf8');
        if (textBytes > MAX_TEXT_BYTES) return fail('语音文本超过长度限制。');
        sendUpstream('input_text_buffer.append', { delta: message.text });
      } else if (message.type === 'finish' && state === 'ready' && textBytes > 0) {
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
