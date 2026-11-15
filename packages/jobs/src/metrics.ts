import { flowMetrics, type AnyPgDb } from '@factory/db';
import { gte, sql } from 'drizzle-orm';

export type Outcome = 'success' | 'failure' | 'limited';

export async function recordFlow(db: AnyPgDb, input: { flow: string; outcome: Outcome; durationMs?: number; now?: Date }): Promise<void> {
  await db.insert(flowMetrics).values({ flow: input.flow, outcome: input.outcome, durationMs: Math.max(0, Math.round(input.durationMs ?? 0)), createdAt: input.now ?? new Date() });
}

export type FlowStat = { flow: string; success: number; failure: number; limited: number; p95Ms: number };

// Per flow over the last `windowMs`: counts by outcome and 95th percentile latency.
export async function flowStats(db: AnyPgDb, windowMs: number, now: Date = new Date()): Promise<FlowStat[]> {
  const since = new Date(now.getTime() - windowMs);
  const rows = await db
    .select({
      flow: flowMetrics.flow,
      success: sql<number>`count(*) filter (where ${flowMetrics.outcome} = 'success')`.mapWith(Number),
      failure: sql<number>`count(*) filter (where ${flowMetrics.outcome} = 'failure')`.mapWith(Number),
      limited: sql<number>`count(*) filter (where ${flowMetrics.outcome} = 'limited')`.mapWith(Number),
      p95Ms: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${flowMetrics.durationMs}), 0)`.mapWith(Number),
    })
    .from(flowMetrics)
    .where(gte(flowMetrics.createdAt, since))
    .groupBy(flowMetrics.flow)
    .orderBy(flowMetrics.flow);
  return rows;
}

// Times an async step and records success or failure (a thrown error is recorded, then rethrown).
export async function timedFlow<T>(db: AnyPgDb, flow: string, run: () => Promise<{ value: T; outcome: Outcome }>): Promise<T> {
  const started = Date.now();
  try {
    const { value, outcome } = await run();
    await recordFlow(db, { flow, outcome, durationMs: Date.now() - started }).catch(() => undefined);
    return value;
  } catch (error) {
    // NEXT_REDIRECT is how Next.js signals a redirect from a server action; it is not a failure.
    const isRedirect = typeof error === 'object' && error !== null && 'digest' in error && String((error as { digest: unknown }).digest).startsWith('NEXT_REDIRECT');
    await recordFlow(db, { flow, outcome: isRedirect ? 'success' : 'failure', durationMs: Date.now() - started }).catch(() => undefined);
    throw error;
  }
}
