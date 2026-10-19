import caseData from '../case.json';

export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 100_000;
const timeoutMs = 45_000;

function chatConfigured() {
  const env = process.env;
  return ['PATIENT_BOT_ID', 'OPENAPI_TOKEN'].every((key) => typeof env[key] === 'string' && env[key]?.trim());
}

function cozeBase() {
  return (process.env.OPENAPI_BASE_URL || 'https://api.coze.cn').replace(/\/+$/, '');
}

function cozeHeaders() {
  return { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAPI_TOKEN}` };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function validMessages(messages: unknown): messages is ChatMessage[] {
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

async function requestCozeChatReply(messages: ChatMessage[], signal: AbortSignal, onDelta: (text: string) => void) {
  const base = cozeBase();
  const headers = cozeHeaders();

  const createResponse = await fetch(`${base}/v3/chat`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      bot_id: process.env.PATIENT_BOT_ID?.trim(),
      user_id: 'hospital-agent-student',
      stream: true,
      auto_save_history: false,
      custom_variables: { case_data: JSON.stringify(caseData) },
      additional_messages: messages.map(({ role, content }) => ({ role, content: content.trim(), content_type: 'text' })),
    }),
  });
  if (!createResponse.ok) {
    const error = new Error(`coze chat create failed: http ${createResponse.status}`) as Error & { status?: number };
    error.status = createResponse.status;
    throw error;
  }

  let answer = '';
  let completed = false;
  const handleEvent = (block: string) => {
    const event = /^event:\s*(.+)$/m.exec(block)?.[1];
    const data = /^data:\s*(.+)$/m.exec(block)?.[1];
    if (!event || !data || event === 'done') return;
    const payload = JSON.parse(data) as Record<string, unknown>;
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
  const body = createResponse.body;
  if (!body) throw new Error('empty body');
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { messages?: unknown; stream?: boolean };
  const messages = body.messages;
  const stream = body.stream === true;

  if (!validMessages(messages)) {
    return new Response(JSON.stringify({ error: '消息格式无效。' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  if (!chatConfigured()) {
    return new Response(JSON.stringify({ error: '聊天服务尚未配置。' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

  try {
    if (stream) {
      const readable = new ReadableStream({
        async start(streamController) {
          try {
            const reply = await requestCozeChatReply(messages, controller.signal, (text) => {
              streamController.enqueue(new TextEncoder().encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`));
            });
            streamController.enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify({ reply })}\n\n`));
            streamController.close();
          } catch (error) {
            const message = error instanceof Error && error.message === 'timeout' ? '聊天服务响应超时。' : '聊天服务暂时不可用。';
            streamController.enqueue(new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`));
            streamController.close();
          }
        },
        cancel() {
          controller.abort();
        },
      });
      return new Response(readable, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
        },
      });
    }

    const reply = await requestCozeChatReply(messages, controller.signal, () => undefined);
    return Response.json({ reply });
  } catch (error) {
    let message = '聊天服务暂时不可用。';
    if (controller.signal.aborted && controller.signal.reason instanceof Error && controller.signal.reason.message === 'timeout') {
      message = '聊天服务响应超时。';
    } else if (error && typeof error === 'object' && 'status' in error && (error.status === 401 || error.status === 403)) {
      message = '聊天服务认证失败。';
    }
    return Response.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
