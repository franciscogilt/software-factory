import { sql } from 'drizzle-orm';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/guard';
import { checkReadiness } from '@/lib/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await checkReadiness(loadConfig(), async () => {
    await getDb().execute(sql`select 1`);
  });
  return Response.json(result, { status: result.ready ? 200 : 503 });
}
