import { PGlite } from '@electric-sql/pglite';
import { DELETION_GRACE_MS, requestAccountDeletion, users, type AnyPgDb } from '@factory/db';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../db/src/schema';
import { purgeAndNotify } from './purge';
import { enqueue } from './queue';

const pg = new PGlite();
const db = drizzle(pg, { schema }) as unknown as AnyPgDb;
const t0 = new Date('2026-03-01T12:00:00Z');

beforeAll(async () => {
  await migrate(drizzle(pg, { schema }), { migrationsFolder: new URL('../../db/migrations', import.meta.url).pathname });
});

describe('purgeAndNotify', () => {
  it('erases due accounts and queues one goodbye email, leaving no other mail to that address', async () => {
    const [user] = await db.insert(users).values({ name: 'Zed', email: 'zed@example.test' }).returning();
    await enqueue(db, { type: 'email.send', payload: { to: 'zed@example.test', subject: 'old', text: 'old' } });
    await requestAccountDeletion(db, user!.id, t0);

    expect(await purgeAndNotify(db, new Date(t0.getTime() + DELETION_GRACE_MS - 1000))).toEqual({ purged: 0, blocked: 0 });
    expect(await purgeAndNotify(db, new Date(t0.getTime() + DELETION_GRACE_MS))).toEqual({ purged: 1, blocked: 0 });
    expect(await db.select().from(users).where(eq(users.id, user!.id))).toHaveLength(0);
    const mails = (await db.select().from(schema.jobs)).filter((j) => j.type === 'email.send');
    expect(mails).toHaveLength(1);
    expect(mails[0]?.payload.subject).toContain('eliminada');
    expect(await purgeAndNotify(db, new Date(t0.getTime() + 2 * DELETION_GRACE_MS))).toEqual({ purged: 0, blocked: 0 });
  });
});
