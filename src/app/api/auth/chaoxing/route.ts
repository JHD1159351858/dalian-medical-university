import { handleChaoxingRequest } from './handler';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleChaoxingRequest(request, 'start'); }
