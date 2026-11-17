import { assessCase } from '../../../../server/caseAssessment.mjs';

// 本次接诊快照按病例参考评分，不能复用其他学生的响应。
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const result = assessCase(body);
  return Response.json(result.body, { status: result.status, headers: { 'cache-control': 'private, no-store' } });
}
