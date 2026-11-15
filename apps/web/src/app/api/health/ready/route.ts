import { loadConfig } from '@/lib/config';
import { checkReadiness } from '@/lib/health';

export const dynamic = 'force-dynamic';

export function GET() {
  const result = checkReadiness(loadConfig());
  return Response.json(result, { status: result.ready ? 200 : 503 });
}
