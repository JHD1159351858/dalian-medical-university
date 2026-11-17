import { chaoxingAuth } from '../../../../../server/chaoxingAuth.mjs';

export async function handleChaoxingRequest(request: Request, action: string) {
  const result = await chaoxingAuth({ action, method: request.method, url: request.url, headers: request.headers }, { signal: request.signal });
  const options = { status: result.status, headers: result.headers };
  return result.body === null ? new Response(null, options) : Response.json(result.body, options);
}
