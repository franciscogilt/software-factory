import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOCK_MINUTES, RECOVERY_CODE_COUNT, createRecoveryCodes, redeemRecoveryCode, verifySecondStep } from './mfa';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });
// Test double: the code is the time step as a string, e.g. '100123456' is not used; '123456' maps to step 100.
const ok = (_s: string, code: string) => (code === '123456' ? 100 : code === '654321' ? 101 : null);
const t0 = new Date('2026-01-01T10:00:00Z');

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  await db.insert(schema.users).values({ id: 'u1', email: 'u1@example.test' });
  const expires = new Date('2030-01-01');
  await db.insert(schema.sessions).values([
    { sessionToken: 's1', userId: 'u1', expires },
    { sessionToken: 's2', userId: 'u1', expires },
  ]);
});

describe('verifySecondStep', () => {
  it('reports not enrolled when the user has no secret', async () => {
    expect(await verifySecondStep(db, { userId: 'u1', sessionToken: 's1', code: '123456', now: t0 }, ok)).toBe('not_enrolled');
  });

  it('rejects wrong codes and locks after 5 failures, even for the right code', async () => {
    await db.insert(schema.userTotp).values({ userId: 'u1', secretEncrypted: 'x' });
    for (let i = 0; i < 4; i++) {
      expect(await verifySecondStep(db, { userId: 'u1', sessionToken: 's1', code: '000000', now: t0 }, ok)).toBe('invalid_code');
    }
    expect(await verifySecondStep(db, { userId: 'u1', sessionToken: 's1', code: '000000', now: t0 }, ok)).toBe('locked');
    expect(await verifySecondStep(db, { userId: 'u1', sessionToken: 's1', code: '123456', now: t0 }, ok)).toBe('locked');
    expect(await db.select().from(schema.mfaSessions)).toHaveLength(0);
  });

  it('unlocks after the lock period and verifies the session', async () => {
    const later = new Date(t0.getTime() + (LOCK_MINUTES + 1) * 60_000);
    expect(await verifySecondStep(db, { userId: 'u1', sessionToken: 's1', code: '123456', now: later }, ok)).toBe('verified');
    const verified = await db.select().from(schema.mfaSessions);
    expect(verified.map((v) => v.sessionToken)).toEqual(['s1']);
  });

  it('only verifies the session that presented the code', async () => {
    const verified = await db.select().from(schema.mfaSessions);
    expect(verified.some((v) => v.sessionToken === 's2')).toBe(false);
  });
});

describe('replay protection', () => {
  it('rejects a code from a step that was already used, and accepts a newer step', async () => {
    const later = new Date(t0.getTime() + 60 * 60_000);
    // step 100 was accepted in the previous test; reusing it must fail
    expect(await verifySecondStep(db, { userId: 'u1', sessionToken: 's2', code: '123456', now: later }, ok)).toBe('invalid_code');
    expect(await verifySecondStep(db, { userId: 'u1', sessionToken: 's2', code: '654321', now: later }, ok)).toBe('verified');
  });
});

describe('recovery codes', () => {
  it('creates 10 codes, stores only hashes, and lets each work exactly once', async () => {
    const codes = await createRecoveryCodes(db, 'u1');
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    const stored = await db.select().from(schema.recoveryCodes);
    expect(stored).toHaveLength(RECOVERY_CODE_COUNT);
    expect(stored.some((r) => codes.includes(r.codeHash))).toBe(false);

    const now = new Date(t0.getTime() + 3 * 60 * 60_000);
    await db.delete(schema.mfaSessions);
    expect(await redeemRecoveryCode(db, { userId: 'u1', sessionToken: 's1', code: codes[0]!.toUpperCase(), now })).toBe('verified');
    expect(await db.select().from(schema.mfaSessions)).toHaveLength(1);
    expect(await redeemRecoveryCode(db, { userId: 'u1', sessionToken: 's2', code: codes[0]!, now })).toBe('invalid_code');
  });

  it('counts wrong recovery codes toward the lock', async () => {
    const now = new Date(t0.getTime() + 5 * 60 * 60_000);
    let last = '';
    for (let i = 0; i < 5; i++) last = await redeemRecoveryCode(db, { userId: 'u1', sessionToken: 's1', code: 'wrong-code', now });
    expect(last).toBe('locked');
    const codes = await createRecoveryCodes(db, 'u1');
    expect(await redeemRecoveryCode(db, { userId: 'u1', sessionToken: 's1', code: codes[0]!, now })).toBe('locked');
  });

  it('regenerating invalidates the old codes', async () => {
    const now = new Date(t0.getTime() + 9 * 60 * 60_000);
    const old = await createRecoveryCodes(db, 'u1');
    await createRecoveryCodes(db, 'u1');
    expect(await redeemRecoveryCode(db, { userId: 'u1', sessionToken: 's1', code: old[0]!, now })).toBe('invalid_code');
  });
});
