import { cozeHeaders, cozeSpeechUrl, speechConfigured, speechPatientId, speechSpeed, speechVoiceId, validSpeechRequest } from '../../../../server/patientServices.mjs';

// 根据本次文本和患者音色合成音频。
export const dynamic = 'force-dynamic';

const timeoutMs = 45_000;
const audioHeaders = { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=300' };
const ttsCache = new Map<string, ArrayBuffer>();

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!validSpeechRequest(body)) return Response.json({ error: '语音文本格式无效。' }, { status: 400 });
  if (!speechConfigured(process.env)) return Response.json({ error: '语音服务尚未配置。' }, { status: 503 });

  const voiceId = speechVoiceId(body, process.env);
  if (!voiceId || voiceId.length > 128) return Response.json({ error: '音色配置无效。' }, { status: 400 });
  const patientId = speechPatientId(body);
  if (patientId.length > 128) return Response.json({ error: '患者配置无效。' }, { status: 400 });
  if (body.contextText !== undefined && (typeof body.contextText !== 'string' || body.contextText.length > 1_000)) {
    return Response.json({ error: '语音风格配置无效。' }, { status: 400 });
  }
  const text = body.text.trim();
  const emotion = typeof body.emotion === 'string' && body.emotion.trim() ? body.emotion.trim() : undefined;
  const contextText = typeof body.contextText === 'string' ? body.contextText.trim() : undefined;
  const speed = speechSpeed(body);
  const cacheKey = JSON.stringify([patientId, voiceId, text, emotion ?? '', speed, contextText ?? '']);
  const cached = ttsCache.get(cacheKey);
  if (cached) return new Response(cached, { headers: audioHeaders });

  const controller = new AbortController();
  const abort = () => controller.abort(request.signal.reason ?? new Error('client disconnected'));
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const upstream = await fetch(cozeSpeechUrl(process.env), {
      method: 'POST', headers: cozeHeaders(process.env),
      body: JSON.stringify({
        input: text, voice_id: voiceId, response_format: 'mp3', sample_rate: 24_000, speed,
        ...(contextText ? { context_texts: contextText } : emotion ? { emotion, emotion_scale: 4 } : {}),
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
      if (oldest !== undefined) ttsCache.delete(oldest);
    }
    ttsCache.set(cacheKey, audio);
    return new Response(audio, { headers: audioHeaders });
  } catch {
    if (controller.signal.aborted && controller.signal.reason instanceof Error && controller.signal.reason.message === 'timeout') {
      return Response.json({ error: '语音服务响应超时。' }, { status: 504 });
    }
    return Response.json({ error: '语音服务暂时不可用。' }, { status: 502 });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  }
}
