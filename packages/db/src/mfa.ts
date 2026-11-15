import { createHash, randomInt } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const RECOVERY_CODE_COUNT = 10;

export type VerifyOutcome = 'verified' | 'invalid_code' | 'locked' | 'not_enrolled';

// Returns the accepted 30-second time step, or null when the code is wrong.
export type CheckCode = (secretEncrypted: string, code: string) => number | null;

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function newRecoveryCode(): string {
  const pick = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${pick()}-${pick()}`;
}

// Replaces any previous codes. The plain codes are returned once and never stored.
export async function createRecoveryCodes(db: AnyDb, userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId));
  await db.insert(schema.recoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })));
  return codes;
}

async function registerFailure(db: AnyDb, userId: string, failedAttempts: number, now: Date): Promise<'invalid_code' | 'locked'> {
  const failed = failedAttempts + 1;
  const lock = failed >= MAX_FAILED_ATTEMPTS;
  await db
    .update(schema.userTotp)
    .set({ failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null })
    .where(eq(schema.userTotp.userId, userId));
  return lock ? 'locked' : 'invalid_code';
}

// One-time code from the authenticator app. After 5 failures the account is locked for 15 minutes.
// A code whose time step was already used is rejected (replay protection).
export async function verifySecondStep(
  db: AnyDb,
  input: { userId: string; sessionToken: string; code: string; now?: Date },
  checkCode: CheckCode,
): Promise<VerifyOutcome> {
  const now = input.now ?? new Date();
  const [row] = await db.select().from(schema.userTotp).where(eq(schema.userTotp.userId, input.userId));
  if (!row) return 'not_enrolled';
  if (row.lockedUntil && row.lockedUntil > now) return 'locked';

  const step = checkCode(row.secretEncrypted, input.code);
  if (step === null || (row.lastUsedStep !== null && step <= row.lastUsedStep)) {
    return registerFailure(db, input.userId, row.failedAttempts, now);
  }

  await db
    .update(schema.userTotp)
    .set({ failedAttempts: 0, lockedUntil: null, confirmedAt: row.confirmedAt ?? now, lastUsedStep: step })
    .where(eq(schema.userTotp.userId, input.userId));
  await db.insert(schema.mfaSessions).values({ sessionToken: input.sessionToken, verifiedAt: now }).onConflictDoNothing();
  return 'verified';
}

// Recovery code instead of the app code. Single use; shares the same attempt limit and lock.
export async function redeemRecoveryCode(
  db: AnyDb,
  input: { userId: string; sessionToken: string; code: string; now?: Date },
): Promise<VerifyOutcome> {
  const now = input.now ?? new Date();
  const [row] = await db.select().from(schema.userTotp).where(eq(schema.userTotp.userId, input.userId));
  if (!row?.confirmedAt) return 'not_enrolled';
  if (row.lockedUntil && row.lockedUntil > now) return 'locked';

  const claimed = await db
    .update(schema.recoveryCodes)
    .set({ usedAt: now })
    .where(and(eq(schema.recoveryCodes.userId, input.userId), eq(schema.recoveryCodes.codeHash, hashRecoveryCode(input.code)), isNull(schema.recoveryCodes.usedAt)))
    .returning({ hash: schema.recoveryCodes.codeHash });
  if (claimed.length === 0) return registerFailure(db, input.userId, row.failedAttempts, now);

  await db.update(schema.userTotp).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.userTotp.userId, input.userId));
  await db.insert(schema.mfaSessions).values({ sessionToken: input.sessionToken, verifiedAt: now }).onConflictDoNothing();
  return 'verified';
}
