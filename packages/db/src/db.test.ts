import { PGlite } from '@electric-sql/pglite';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedSynthetic } from '../seed/data';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  await seedSynthetic(db);
});

describe('schema and migrations', () => {
  it('applies migrations and seeds synthetic data', async () => {
    const orgs = await db.select().from(schema.organizations);
    expect(orgs).toHaveLength(2);
  });

  it('keeps organizations isolated: a member only sees their own organization', async () => {
    const [carla] = await db.select().from(schema.users).where(eq(schema.users.email, 'carla@example.test'));
    const rows = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, carla!.id));
    expect(rows).toHaveLength(1);
    const [ana] = await db.select().from(schema.users).where(eq(schema.users.email, 'ana@example.test'));
    const cross = await db
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.userId, ana!.id), eq(schema.memberships.organizationId, rows[0]!.organizationId)));
    expect(cross).toHaveLength(0);
  });

  it('rejects duplicate emails', async () => {
    await expect(db.insert(schema.users).values({ email: 'ana@example.test' })).rejects.toThrow();
  });

  it('cascades membership deletion when a user is deleted', async () => {
    const [beto] = await db.select().from(schema.users).where(eq(schema.users.email, 'beto@example.test'));
    await db.delete(schema.users).where(eq(schema.users.id, beto!.id));
    const left = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, beto!.id));
    expect(left).toHaveLength(0);
  });
});
