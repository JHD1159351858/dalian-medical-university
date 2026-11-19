import { publicCases } from '../../../../server/trainingCases.mjs';

export const dynamic = 'force-static';
export function GET() {
  return Response.json({ cases: publicCases });
}
