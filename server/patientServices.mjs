/** @typedef {{ role: 'user' | 'assistant', content: string }} ChatMessage */
/** @typedef {Record<string, string | undefined>} ServiceEnvironment */
/** @typedef {{ botId?: string, customVariables?: Record<string, string> }} ChatContext */
/** @typedef {{ text: string, voiceId?: unknown, patientId?: unknown, emotion?: unknown, speed?: unknown, contextText?: unknown }} SpeechBody */

const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 100_000;
const MAX_TTS_CHARS = 1_024;
/** @param {ServiceEnvironment} env */
export function chatConfigured(env) {
  return ['PATIENT_BOT_ID', 'OPENAPI_TOKEN'].every((key) => typeof env[key] === 'string' && env[key].trim());
}

/** @param {ServiceEnvironment} env */
export function speechConfigured(env) {
  return ['OPENAPI_TOKEN', 'PATIENT_VOICE_ID'].every((key) => typeof env[key] === 'string' && env[key].trim());
}

/** @param {unknown} messages
 * @returns {messages is ChatMessage[]} */
export function validMessages(messages) {
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

/** @param {ServiceEnvironment} env */
export function cozeBase(env) {
  return (env.OPENAPI_BASE_URL || 'https://api.coze.cn').replace(/\/+$/, '');
}

/** @param {ServiceEnvironment} env */
export function cozeHeaders(env) {
  return { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAPI_TOKEN}` };
}

/** @param {ServiceEnvironment} env */
export function cozeSpeechUrl(env) {
  return `${cozeBase(env)}/v1/audio/speech`;
}

/** @param {unknown} body
 * @returns {body is SpeechBody} */
export function validSpeechRequest(body) {
  return Boolean(body && typeof body.text === 'string' && body.text.trim() && body.text.trim().length <= MAX_TTS_CHARS);
}

/** @param {SpeechBody} body */
export function speechSpeed(body) {
  return typeof body?.speed === 'number' && Number.isFinite(body.speed) ? Math.min(2, Math.max(0.5, body.speed)) : 0.95;
}

/** @param {SpeechBody} body
 * @param {ServiceEnvironment} env */
export function speechVoiceId(body, env) {
  return typeof body?.voiceId === 'string' && body.voiceId.trim() ? body.voiceId.trim() : env.PATIENT_VOICE_ID;
}

/** @param {SpeechBody} body */
export function speechPatientId(body) {
  return typeof body?.patientId === 'string' && body.patientId.trim() ? body.patientId.trim() : 'default-patient';
}

/**
 * @param {ServiceEnvironment} env
 * @param {ChatMessage[]} messages
 * @param {AbortSignal} signal
 * @param {(text: string) => void} onDelta
 * @param {typeof fetch} fetchImpl
 * @param {ChatContext} context
 * @returns {Promise<string>}
 */
export async function requestCozeChatReply(env, messages, signal, onDelta = () => {}, fetchImpl = globalThis.fetch, context = {}) {
  const base = cozeBase(env);
  const headers = cozeHeaders(env);

  const createResponse = await fetchImpl(`${base}/v3/chat`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      bot_id: (context.botId || env.PATIENT_BOT_ID).trim(),
      user_id: 'hospital-agent-student',
      stream: true,
      auto_save_history: false,
      custom_variables: context.customVariables || {},
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
  if (!createResponse.body) throw new Error('coze chat empty body');
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

