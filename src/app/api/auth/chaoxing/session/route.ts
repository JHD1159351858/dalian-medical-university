import { handleChaoxingRequest } from '../handler';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handleChaoxingRequest(request, 'session'); }
