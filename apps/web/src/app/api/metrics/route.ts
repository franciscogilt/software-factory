import { flowStats, queueStats, THRESHOLDS } from '@factory/jobs';
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/guard';
import { renderMetrics } from '@/lib/metrics-text';

export const dynamic = 'force-dynamic';

function tokenMatches(header: string | null, expected: string): boolean {
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

// Scraped by the monitoring system. Closed unless METRICS_TOKEN is set and sent as a bearer token.
export async function GET(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected || !tokenMatches(request.headers.get('authorization'), expected)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = getDb();
  const [queue, flows] = await Promise.all([queueStats(db), flowStats(db, THRESHOLDS.windowMs)]);
  return new Response(renderMetrics(queue, flows, THRESHOLDS.windowMs / 1000), { headers: { 'content-type': 'text/plain; version=0.0.4' } });
}
