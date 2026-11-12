import caseData from '../../../../server/case.json';
import { patientInterviewReply } from '../../../../server/patientInterview.mjs';
import { chatConfigured, requestCozeChatReply, validMessages } from '../../../../server/patientServices.mjs';

// 每次问诊都需读取本次请求的消息和服务状态。
export const dynamic = 'force-dynamic';

const timeoutMs = 45_000;
const eventHeaders = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' };

function failure(error: unknown, signal: AbortSignal) {
  if (signal.aborted && signal.reason instanceof Error && signal.reason.message === 'timeout') {
    return { status: 504, error: '聊天服务响应超时。' };
  }
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if (status === 401 || status === 403) return { status: 502, error: '聊天服务认证失败。' };
  if (status === 429) return { status: 429, error: '聊天服务繁忙，请稍后重试。' };
  return { status: 502, error: '聊天服务暂时不可用。' };
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const messages = payload.messages;
  if (!validMessages(messages) || messages.at(-1)?.role !== 'user') {
    return Response.json({ error: '消息格式无效。' }, { status: 400 });
  }
  const streaming = payload.stream === true;
  const knownReply = patientInterviewReply(messages, caseData);
  if (knownReply !== null) {
    const result = { reply: knownReply, source: 'case_rules' };
    if (!streaming) return Response.json(result);
    return new Response(`event: delta\ndata: ${JSON.stringify({ text: knownReply })}\n\nevent: done\ndata: ${JSON.stringify(result)}\n\n`, { headers: eventHeaders });
  }
  if (!chatConfigured(process.env)) return Response.json({ error: '聊天服务尚未配置。' }, { status: 503 });

  const controller = new AbortController();
  const abort = () => controller.abort(request.signal.reason ?? new Error('client disconnected'));
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  };
  const reply = (onDelta: (text: string) => void) => requestCozeChatReply(
    process.env, messages, controller.signal, onDelta, fetch,
    { customVariables: { case_data: JSON.stringify(caseData) } },
  );

  if (streaming) {
    let cancelled = false;
    const readable = new ReadableStream<Uint8Array>({
      start(output) {
        const emit = (event: string, data: object) => {
          if (!cancelled && !request.signal.aborted) output.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        void reply((text) => emit('delta', { text })).then((answer) => {
          emit('done', { reply: answer });
        }).catch((error: unknown) => {
          emit('error', { error: failure(error, controller.signal).error });
        }).finally(() => {
          cleanup();
          if (!cancelled) output.close();
        });
      },
      cancel() {
        cancelled = true;
        controller.abort(new Error('client disconnected'));
        cleanup();
      },
    });
    return new Response(readable, { headers: eventHeaders });
  }

  try {
    return Response.json({ reply: await reply(() => undefined) });
  } catch (error) {
    const result = failure(error, controller.signal);
    return Response.json({ error: result.error }, { status: result.status });
  } finally {
    cleanup();
  }
}
