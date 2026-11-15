import { jobs, type AnyPgDb } from '@factory/db';
import { and, asc, count, eq, lt, lte, or, sql } from 'drizzle-orm';

export type Job = typeof jobs.$inferSelect;

export const LOCK_TIMEOUT_MS = 5 * 60_000;

// 30 s, 1 min, 2 min, 4 min... capped at 1 hour. Deterministic so it can be tested.
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(attempts - 1, 0), 3_600_000);
}

export async function enqueue(
  db: AnyPgDb,
  input: { type: string; payload: Record<string, unknown>; organizationId?: string; idempotencyKey?: string; maxAttempts?: number; runAt?: Date },
): Promise<{ id: string | null; duplicate: boolean }> {
  const rows = await db
    .insert(jobs)
    .values({
      type: input.type,
      payload: input.payload,
      organizationId: input.organizationId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      maxAttempts: input.maxAttempts ?? 5,
      runAt: input.runAt ?? new Date(),
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning({ id: jobs.id });
  return { id: rows[0]?.id ?? null, duplicate: rows.length === 0 };
}

// Takes the next due job. Several workers can run at once: rows already locked by another worker are skipped.
// A job left "running" past the lock timeout (worker crashed) becomes available again.
export async function claimNext(db: AnyPgDb, now: Date = new Date()): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
    const [next] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(or(and(eq(jobs.status, 'queued'), lte(jobs.runAt, now)), and(eq(jobs.status, 'running'), lt(jobs.lockedAt, staleBefore))))
      .orderBy(asc(jobs.runAt))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx
      .update(jobs)
      .set({ status: 'running', lockedAt: now, attempts: sql`${jobs.attempts} + 1` })
      .where(eq(jobs.id, next.id))
      .returning();
    return claimed ?? null;
  });
}

// The payload is cleared on success: it may hold one-time links that must not stay in the database.
export async function complete(db: AnyPgDb, id: string, now: Date = new Date()): Promise<void> {
  await db.update(jobs).set({ status: 'succeeded', finishedAt: now, lockedAt: null, lastError: null, payload: {} }).where(eq(jobs.id, id));
}

export async function fail(db: AnyPgDb, job: Job, error: unknown, now: Date = new Date()): Promise<'retry' | 'dead'> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  if (job.attempts >= job.maxAttempts) {
    await db.update(jobs).set({ status: 'dead', finishedAt: now, lockedAt: null, lastError: message }).where(eq(jobs.id, job.id));
    return 'dead';
  }
  await db
    .update(jobs)
    .set({ status: 'queued', lockedAt: null, lastError: message, runAt: new Date(now.getTime() + backoffMs(job.attempts)) })
    .where(eq(jobs.id, job.id));
  return 'retry';
}

// Failed-jobs queue: dead jobs can be sent back for another round of attempts.
export async function retryDead(db: AnyPgDb, id: string, now: Date = new Date(), organizationId?: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: 'queued', attempts: 0, runAt: now, finishedAt: null, lastError: null })
    .where(and(eq(jobs.id, id), eq(jobs.status, 'dead'), organizationId ? eq(jobs.organizationId, organizationId) : undefined))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

export async function listDead(db: AnyPgDb, organizationId: string, limit = 50): Promise<Job[]> {
  return db.select().from(jobs).where(and(eq(jobs.organizationId, organizationId), eq(jobs.status, 'dead'))).orderBy(asc(jobs.finishedAt)).limit(limit);
}

export async function queueStats(db: AnyPgDb, now: Date = new Date()): Promise<{ queued: number; running: number; dead: number; oldestQueuedMs: number | null }> {
  const rows = await db.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  const [oldest] = await db.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.status, 'queued')).orderBy(asc(jobs.runAt)).limit(1);
  return { queued: by.queued ?? 0, running: by.running ?? 0, dead: by.dead ?? 0, oldestQueuedMs: oldest ? Math.max(now.getTime() - oldest.runAt.getTime(), 0) : null };
}
