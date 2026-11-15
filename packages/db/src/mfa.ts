import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type VerifyOutcome = 'verified' | 'invalid_code' | 'locked' | 'not_enrolled';

// Checks a one-time code with progressive protection: after 5 failures the account is locked for 15 minutes.
// `checkCode` receives the stored (encrypted) secret and the submitted code, so crypto stays outside the database package.
export async function verifySecondStep(
  db: AnyDb,
  input: { userId: string; sessionToken: string; code: string; now?: Date },
  checkCode: (secretEncrypted: string, code: string) => boolean,
): Promise<VerifyOutcome> {
  const now = input.now ?? new Date();
  const [row] = await db.select().from(schema.userTotp).where(eq(schema.userTotp.userId, input.userId));
  if (!row) return 'not_enrolled';
  if (row.lockedUntil && row.lockedUntil > now) return 'locked';

  if (!checkCode(row.secretEncrypted, input.code)) {
    const failed = row.failedAttempts + 1;
    const lock = failed >= MAX_FAILED_ATTEMPTS;
    await db
      .update(schema.userTotp)
      .set({ failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null })
      .where(eq(schema.userTotp.userId, input.userId));
    return lock ? 'locked' : 'invalid_code';
  }

  await db.update(schema.userTotp).set({ failedAttempts: 0, lockedUntil: null, confirmedAt: row.confirmedAt ?? now }).where(eq(schema.userTotp.userId, input.userId));
  await db.insert(schema.mfaSessions).values({ sessionToken: input.sessionToken, verifiedAt: now }).onConflictDoNothing();
  return 'verified';
}
