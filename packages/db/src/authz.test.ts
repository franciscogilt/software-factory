import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedSynthetic } from '../seed/data';
import { authorize, roleAtLeast } from './authz';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });
let orgA = '';
let orgB = '';
let ana = '';
let beto = '';
let carla = '';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  await seedSynthetic(db);
  const orgs = await db.select().from(schema.organizations);
  orgA = orgs.find((o) => o.name === 'Acme Demo')!.id;
  orgB = orgs.find((o) => o.name === 'Globex Demo')!.id;
  const users = await db.select().from(schema.users);
  ana = users.find((u) => u.email === 'ana@example.test')!.id;
  beto = users.find((u) => u.email === 'beto@example.test')!.id;
  carla = users.find((u) => u.email === 'carla@example.test')!.id;
  const expires = new Date(Date.now() + 3600_000);
  await db.insert(schema.sessions).values([
    { sessionToken: 's-ana', userId: ana, expires },
    { sessionToken: 's-ana-mfa', userId: ana, expires },
    { sessionToken: 's-beto', userId: beto, expires },
  ]);
  await db.insert(schema.mfaSessions).values({ sessionToken: 's-ana-mfa' });
});

describe('roleAtLeast', () => {
  it('orders roles owner > admin > member', () => {
    expect(roleAtLeast('owner', 'admin')).toBe(true);
    expect(roleAtLeast('admin', 'owner')).toBe(false);
    expect(roleAtLeast('member', 'member')).toBe(true);
  });
});

describe('authorize', () => {
  it('denies users who are not members of the organization (tenant isolation)', async () => {
    const r = await authorize(db, { userId: carla, organizationId: orgA, minimumRole: 'member', sessionToken: 'x' });
    expect(r).toEqual({ allowed: false, reason: 'not_member' });
    const r2 = await authorize(db, { userId: ana, organizationId: orgB, minimumRole: 'member', sessionToken: 's-ana-mfa' });
    expect(r2).toEqual({ allowed: false, reason: 'not_member' });
  });

  it('denies members from admin actions', async () => {
    const r = await authorize(db, { userId: beto, organizationId: orgA, minimumRole: 'admin', sessionToken: 's-beto' });
    expect(r).toEqual({ allowed: false, reason: 'insufficient_role' });
  });

  it('lets members act without a second step', async () => {
    const r = await authorize(db, { userId: beto, organizationId: orgA, minimumRole: 'member', sessionToken: 's-beto' });
    expect(r).toEqual({ allowed: true, role: 'member' });
  });

  it('requires a verified second step for owners and admins', async () => {
    const without = await authorize(db, { userId: ana, organizationId: orgA, minimumRole: 'member', sessionToken: 's-ana' });
    expect(without).toEqual({ allowed: false, reason: 'mfa_required' });
    const withMfa = await authorize(db, { userId: ana, organizationId: orgA, minimumRole: 'admin', sessionToken: 's-ana-mfa' });
    expect(withMfa).toEqual({ allowed: true, role: 'owner' });
  });

  it('drops the second-step verification when the session is deleted', async () => {
    await db.delete(schema.sessions).where((await import('drizzle-orm')).eq(schema.sessions.sessionToken, 's-ana-mfa'));
    const left = await db.select().from(schema.mfaSessions);
    expect(left).toHaveLength(0);
  });
});
