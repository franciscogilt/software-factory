import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOCK_MINUTES, verifySecondStep } from './mfa';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });
const ok = (_s: string, code: string) => code === '123456';
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
