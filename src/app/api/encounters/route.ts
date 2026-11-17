import { encounterRecords, readEncounterBody } from '../../../../server/encounterRecords.mjs';

// 每次访问按Supabase真实会话验证学生身份，不能静态缓存。
export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'private, no-store' };

export async function GET(request: Request) {
  const result = await encounterRecords({ method: 'GET', url: request.url, authorization: request.headers.get('x-sandbox-authorization') ?? request.headers.get('authorization') }, { signal: request.signal });
  return Response.json(result.body, { status: result.status, headers });
}

export async function PUT(request: Request) {
  const parsed = await readEncounterBody(request);
  if (!('value' in parsed)) return Response.json({ error: parsed.error }, { status: parsed.status, headers });
  const result = await encounterRecords({ method: 'PUT', url: request.url, authorization: request.headers.get('x-sandbox-authorization') ?? request.headers.get('authorization'), body: parsed.value }, { signal: request.signal });
  return Response.json(result.body, { status: result.status, headers });
}
