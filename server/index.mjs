import express from 'express';
import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { attachSpeechStream } from './speechStream.mjs';

export { attachSpeechStream };

const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 100_000;
const MAX_TTS_CHARS = 1_024;
const caseData = readFileSync(new URL('./case.json', import.meta.url), 'utf8');

function chatConfigured(env) {
  return ['PATIENT_BOT_ID', 'OPENAPI_TOKEN'].every((key) => typeof env[key] === 'string' && env[key].trim());
}

function speechConfigured(env) {
  return ['OPENAPI_TOKEN', 'PATIENT_VOICE_ID'].every((key) => typeof env[key] === 'string' && env[key].trim());
}

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return false;
  let total = 0;
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return false;
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) return false;
    total += content.length;
  }
  return total <= MAX_TOTAL_CHARS;
}

function cozeBase(env) {
  return (env.OPENAPI_BASE_URL || 'https://api.coze.cn').replace(/\/+$/, '');
}

function cozeHeaders(env) {
  return { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAPI_TOKEN}` };
}

function cozeSpeechUrl(env) {
  return `${cozeBase(env)}/v1/audio/speech`;
}

function validSpeechRequest(body) {
  return Boolean(body && typeof body.text === 'string' && body.text.trim() && body.text.trim().length <= MAX_TTS_CHARS);
}

function speechSpeed(body) {
  return typeof body?.speed === 'number' && Number.isFinite(body.speed) ? Math.min(2, Math.max(0.5, body.speed)) : 0.95;
}

function speechVoiceId(body, env) {
  return typeof body?.voiceId === 'string' && body.voiceId.trim() ? body.voiceId.trim() : env.PATIENT_VOICE_ID;
}

function speechPatientId(body) {
  return typeof body?.patientId === 'string' && body.patientId.trim() ? body.patientId.trim() : 'default-patient';
}

async function requestCozeChatReply(env, messages, signal, onDelta = () => {}) {
  const base = cozeBase(env);
  const headers = cozeHeaders(env);

  const createResponse = await fetch(`${base}/v3/chat`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      bot_id: env.PATIENT_BOT_ID.trim(),
      user_id: 'hospital-agent-student',
      stream: true,
      auto_save_history: false,
      custom_variables: { case_data: caseData },
      additional_messages: messages.map(({ role, content }) => ({ role, content: content.trim(), content_type: 'text' })),
    }),
  });
  if (!createResponse.ok) {
    const error = new Error(`coze chat create failed: http ${createResponse.status}`);
    error.status = createResponse.status;
    throw error;
  }

  let answer = '';
  let completed = false;
  const handleEvent = (block) => {
    const event = /^event:\s*(.+)$/m.exec(block)?.[1];
    const data = /^data:\s*(.+)$/m.exec(block)?.[1];
    if (!event || !data || event === 'done') return;
    const payload = JSON.parse(data);
    if (event === 'conversation.chat.failed' || event === 'error') throw new Error('coze chat failed');
    if (event === 'conversation.chat.completed') completed = true;
    if (event === 'conversation.message.delta' && payload?.role === 'assistant' && payload?.type === 'answer' && typeof payload.content === 'string') {
      onDelta(payload.content);
    }
    if (event === 'conversation.message.completed' && payload?.role === 'assistant' && payload?.type === 'answer' && typeof payload.content === 'string') {
      answer = payload.content.trim();
    }
  };
  const decoder = new TextDecoder();
  let pending = '';
  for await (const chunk of createResponse.body) {
    pending += decoder.decode(chunk, { stream: true });
    let separator;
    while ((separator = /\r?\n\r?\n/.exec(pending))) {
      handleEvent(pending.slice(0, separator.index));
      pending = pending.slice(separator.index + separator[0].length);
    }
  }
  pending += decoder.decode();
  if (pending.trim()) handleEvent(pending);
  if (!completed || !answer) throw new Error('coze chat empty answer');
  return answer;
}

export function createApp({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 45_000 } = {}) {
  const app = express();
  const ttsCache = new Map();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_request, response) => response.json({ configured: chatConfigured(env), tts: speechConfigured(env) }));

  app.post('/api/chat', async (request, response) => {
    const messages = request.body?.messages;
    const stream = request.body?.stream === true;
    if (!validMessages(messages)) return response.status(400).json({ error: '消息格式无效。' });
    if (!chatConfigured(env)) return response.status(503).json({ error: '聊天服务尚未配置。' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const abortOnDisconnect = () => controller.abort(new Error('client disconnected'));
    request.once('aborted', abortOnDisconnect);
    response.once('close', () => {
      if (!response.writableEnded) abortOnDisconnect();
    });

    try {
      if (stream) {
        response.set({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' });
        response.flushHeaders();
      }
      const reply = await requestCozeChatReply(env, messages, controller.signal, (text) => {
        if (stream && !response.destroyed) response.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
      });
      if (stream) {
        response.write(`event: done\ndata: ${JSON.stringify({ reply })}\n\n`);
        return response.end();
      }
      return response.json({ reply });
    } catch (error) {
      let status = 502;
      let message = '聊天服务暂时不可用。';
      if (controller.signal.aborted && controller.signal.reason?.message === 'timeout') {
        status = 504;
        message = '聊天服务响应超时。';
      } else if (error?.status === 401 || error?.status === 403) {
        message = '聊天服务认证失败。';
      }
      if (!response.destroyed && !response.writableEnded) {
        if (stream) {
          response.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
          return response.end();
        }
        return response.status(status).json({ error: message });
      }
    } finally {
      clearTimeout(timer);
      request.removeListener('aborted', abortOnDisconnect);
    }
  });

  app.post('/api/tts', async (request, response) => {
    if (!validSpeechRequest(request.body)) return response.status(400).json({ error: '语音文本格式无效。' });
    if (!speechConfigured(env)) return response.status(503).json({ error: '语音服务尚未配置。' });

    const voiceId = speechVoiceId(request.body, env);
    if (!voiceId || voiceId.length > 128) return response.status(400).json({ error: '音色配置无效。' });
    const patientId = speechPatientId(request.body);
    if (patientId.length > 128) return response.status(400).json({ error: '患者配置无效。' });
    const text = request.body.text.trim();
    const emotion = typeof request.body.emotion === 'string' && request.body.emotion.trim() ? request.body.emotion.trim() : undefined;
    const speed = speechSpeed(request.body);
    const cacheKey = JSON.stringify([patientId, voiceId, text, emotion ?? '', speed]);
    const cached = ttsCache.get(cacheKey);
    if (cached) {
      response.set('content-type', 'audio/mpeg');
      response.set('cache-control', 'private, max-age=300');
      return response.send(cached);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    const abortOnDisconnect = () => controller.abort(new Error('client disconnected'));
    request.once('aborted', abortOnDisconnect);
    response.once('close', () => { if (!response.writableEnded) abortOnDisconnect(); });
    try {
      const upstream = await fetchImpl(cozeSpeechUrl(env), {
        method: 'POST',
        headers: cozeHeaders(env),
        body: JSON.stringify({ input: text, voice_id: voiceId, response_format: 'mp3', sample_rate: 24_000, speed, ...(emotion ? { emotion, emotion_scale: 4 } : {}) }),
        signal: controller.signal,
      });
      if (!upstream.ok) {
        if (upstream.status === 401 || upstream.status === 403) return response.status(502).json({ error: '语音服务认证失败。' });
        if (upstream.status === 429) return response.status(429).json({ error: '语音服务繁忙，请稍后重试。' });
        return response.status(502).json({ error: '语音服务暂时不可用。' });
      }
      const audio = Buffer.from(await upstream.arrayBuffer());
      if (ttsCache.size >= 64) ttsCache.delete(ttsCache.keys().next().value);
      ttsCache.set(cacheKey, audio);
      response.set('content-type', 'audio/mpeg');
      response.set('cache-control', 'private, max-age=300');
      return response.send(audio);
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason?.message === 'timeout') return response.status(504).json({ error: '语音服务响应超时。' });
      if (!response.writableEnded && !controller.signal.aborted) return response.status(502).json({ error: '语音服务暂时不可用。' });
    } finally {
      clearTimeout(timer);
      request.removeListener('aborted', abortOnDisconnect);
    }
  });

  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
      return response.status(400).json({ error: '消息格式无效。' });
    }
    return response.status(500).json({ error: '服务器错误。' });
  });

  const currentDir = dirname(fileURLToPath(import.meta.url));
  const distDir = join(currentDir, '..', 'dist');
  if (existsSync(distDir)) app.use(express.static(distDir));
  return app;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  dotenv.config();
  const port = Number(process.env.DEPLOY_RUN_PORT) || Number(process.env.PORT) || 3001;
  const server = createServer(createApp());
  attachSpeechStream(server);
  server.listen(port, '0.0.0.0', () => console.log(`Hospital agent listening on ${port}`));
}
