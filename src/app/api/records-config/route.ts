import { recordsConfiguration } from '../../../../server/encounterRecords.mjs';

// 配置取自当前服务环境，仅允许暴露public key。
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = recordsConfiguration();
  return Response.json(result.body, { status: result.status });
}
