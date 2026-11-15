import type { AnyPgDb } from '@factory/db';
import { createDb } from '@factory/db';
import { recordFlow } from '@factory/jobs/metrics';

let cached: { db: AnyPgDb } | undefined;

// Unhandled server errors: one structured JSON line (no request bodies, no user data) and a failure event
// in the "unhandled" flow so the monitor can alert on spikes.
export async function reportRequestError(error: unknown, request: { path: string; method: string }, route: string | undefined): Promise<void> {
  const err = error as { message?: string; digest?: string };
  console.error(JSON.stringify({ level: 'error', msg: err.message ?? 'unknown', digest: err.digest, path: request.path, method: request.method, route }));
  try {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    cached ??= createDb(url);
    await recordFlow(cached.db, { flow: 'unhandled', outcome: 'failure' });
  } catch {
    // Never let monitoring break error handling.
  }
}
