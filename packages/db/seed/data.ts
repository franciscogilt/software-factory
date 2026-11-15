import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '../src/schema';

// Synthetic data only. Never copy real production data into other environments.
export async function seedSynthetic(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const [orgA, orgB] = await db
    .insert(schema.organizations)
    .values([{ name: 'Acme Demo' }, { name: 'Globex Demo' }])
    .returning();
  if (!orgA || !orgB) throw new Error('seed failed');

  const people = await db
    .insert(schema.users)
    .values([
      { name: 'Ana Demo', email: 'ana@example.test' },
      { name: 'Beto Demo', email: 'beto@example.test' },
      { name: 'Carla Demo', email: 'carla@example.test' },
      { name: 'Dani Demo', email: 'dani@example.test' },
    ])
    .returning();
  const [ana, beto, carla, dani] = people;
  if (!ana || !beto || !carla || !dani) throw new Error('seed failed');

  await db.insert(schema.memberships).values([
    { organizationId: orgA.id, userId: ana.id, role: 'owner' },
    { organizationId: orgA.id, userId: beto.id, role: 'member' },
    { organizationId: orgA.id, userId: dani.id, role: 'owner' },
    { organizationId: orgB.id, userId: carla.id, role: 'owner' },
  ]);
}
