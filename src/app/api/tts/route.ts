export const dynamic = 'force-dynamic';

const MAX_TTS_CHARS = 1_024;
const timeoutMs = 45_000;

function speechConfigured() {
  const env = process.env;
  return ['OPENAPI_TOKEN', 'PATIENT_VOICE_ID'].every((key) => typeof env[key] === 'string' && env[key]?.trim());
}

function cozeBase() {
  return (process.env.OPENAPI_BASE_URL || 'https://api.coze.cn').replace(/\/+$/, '');
}

function cozeHeaders() {
  return { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAPI_TOKEN}` };
}

function cozeSpeechUrl() {
  return `${cozeBase()}/v1/audio/speech`;
}

interface TtsBody {
  text?: string;
  voiceId?: string;
  patientId?: string;
  emotion?: string;
  speed?: number;
}

function validSpeechRequest(body: TtsBody) {
  return Boolean(body && typeof body.text === 'string' && body.text.trim() && body.text.trim().length <= MAX_TTS_CHARS);
}

function speechSpeed(body: TtsBody) {
  return typeof body.speed === 'number' && Number.isFinite(body.speed) ? Math.min(2, Math.max(0.5, body.speed)) : 0.95;
}

function speechVoiceId(body: TtsBody) {
  return typeof body.voiceId === 'string' && body.voiceId.trim() ? body.voiceId.trim() : process.env.PATIENT_VOICE_ID;
}

function speechPatientId(body: TtsBody) {
  return typeof body.patientId === 'string' && body.patientId.trim() ? body.patientId.trim() : 'default-patient';
}

const ttsCache = new Map<string, ArrayBuffer>();

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as TtsBody;
  if (!validSpeechRequest(body)) {
    return Response.json({ error: '语音文本格式无效。' }, { status: 400 });
  }
  if (!speechConfigured()) {
    return Response.json({ error: '语音服务尚未配置。' }, { status: 503 });
  }

  const voiceId = speechVoiceId(body);
  if (!voiceId || voiceId.length > 128) return Response.json({ error: '音色配置无效。' }, { status: 400 });
  const patientId = speechPatientId(body);
  if (patientId.length > 128) return Response.json({ error: '患者配置无效。' }, { status: 400 });
  const text = body.text!.trim();
  const emotion = typeof body.emotion === 'string' && body.emotion.trim() ? body.emotion.trim() : undefined;
  const speed = speechSpeed(body);
  const cacheKey = JSON.stringify([patientId, voiceId, text, emotion ?? '', speed]);
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    return new Response(cached, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=300' } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const upstream = await fetch(cozeSpeechUrl(), {
      method: 'POST',
      headers: cozeHeaders(),
      body: JSON.stringify({
        input: text,
        voice_id: voiceId,
        response_format: 'mp3',
        sample_rate: 24_000,
        speed,
        ...(emotion ? { emotion, emotion_scale: 4 } : {}),
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) return Response.json({ error: '语音服务认证失败。' }, { status: 502 });
      if (upstream.status === 429) return Response.json({ error: '语音服务繁忙，请稍后重试。' }, { status: 429 });
      return Response.json({ error: '语音服务暂时不可用。' }, { status: 502 });
    }
    const audio = await upstream.arrayBuffer();
    if (ttsCache.size >= 64) {
      const oldest = ttsCache.keys().next().value;
      if (typeof oldest === 'string') ttsCache.delete(oldest);
    }
    ttsCache.set(cacheKey, audio);
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=300' } });
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof Error && controller.signal.reason.message === 'timeout') {
      return Response.json({ error: '语音服务响应超时。' }, { status: 504 });
    }
    return Response.json({ error: '语音服务暂时不可用。' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
