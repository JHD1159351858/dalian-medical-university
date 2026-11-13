import { getPulseExam, submitPulseExam } from '../../../../server/pulseExam.mjs';

// 练习线索和提交反馈按本次病例请求返回。
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = getPulseExam(new URL(request.url).searchParams.get('caseId'));
  return Response.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const submission = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const result = submitPulseExam(submission.caseId, submission.selected);
  return Response.json(result.body, { status: result.status });
}
