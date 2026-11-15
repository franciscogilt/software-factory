import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

// Counts one attempt for `key`. Going over `limit` inside a window blocks the key for one window,
// and every further offence doubles the block (capped at 24 hours). A quiet period clears the history.
export async function hitRateLimit(
  db: AnyDb,
  input: { key: string; limit: number; windowMs: number; now?: Date },
): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  await db.insert(schema.rateLimits).values({ key: input.key, count: 0, windowStart: now }).onConflictDoNothing();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, input.key)).for('update');
    if (!row) return { allowed: true } as const;

    if (row.blockedUntil && row.blockedUntil > now) {
      return { allowed: false, retryAfterMs: row.blockedUntil.getTime() - now.getTime() } as const;
    }

    const windowExpired = now.getTime() - row.windowStart.getTime() >= input.windowMs;
    // After a block ends, or a full quiet window, start counting again. Strikes only fade after 24 hours of quiet.
    const quietLong = now.getTime() - row.windowStart.getTime() >= 24 * 3_600_000;
    const count = windowExpired ? 1 : row.count + 1;
    const strikes = quietLong ? 0 : row.strikes;
    const windowStart = windowExpired ? now : row.windowStart;

    if (count > input.limit) {
      const newStrikes = strikes + 1;
      const blockMs = Math.min(input.windowMs * 2 ** (newStrikes - 1), 24 * 3_600_000);
      await tx.update(schema.rateLimits).set({ count, windowStart, strikes: newStrikes, blockedUntil: new Date(now.getTime() + blockMs) }).where(eq(schema.rateLimits.key, input.key));
      return { allowed: false, retryAfterMs: blockMs } as const;
    }
    await tx.update(schema.rateLimits).set({ count, windowStart, strikes, blockedUntil: null }).where(eq(schema.rateLimits.key, input.key));
    return { allowed: true } as const;
  });
}
