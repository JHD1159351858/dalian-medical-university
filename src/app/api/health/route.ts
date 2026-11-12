import { chatConfigured, speechConfigured } from '../../../../server/patientServices.mjs';

// 服务配置随运行环境变化，健康检查不做静态缓存。
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ configured: chatConfigured(process.env), tts: speechConfigured(process.env), interview: true });
}
