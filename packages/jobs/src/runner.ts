import type { AnyPgDb } from '@factory/db';
import { claimNext, complete, fail, type Job } from './queue';

export type Handler = (payload: Record<string, unknown>, job: Job) => Promise<void>;
export type Handlers = Record<string, Handler>;

export type RunResult = 'idle' | 'succeeded' | 'retry' | 'dead';

// Runs at most one due job. Handlers must be idempotent: a job can run again after a crash.
export async function runOnce(db: AnyPgDb, handlers: Handlers, now: Date = new Date()): Promise<RunResult> {
  const job = await claimNext(db, now);
  if (!job) return 'idle';
  const handler = handlers[job.type];
  try {
    if (!handler) throw new Error(`No handler for job type "${job.type}"`);
    await handler(job.payload, job);
    await complete(db, job.id, now);
    return 'succeeded';
  } catch (error) {
    return fail(db, job, error, now);
  }
}
