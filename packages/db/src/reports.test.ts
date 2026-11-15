import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedSynthetic } from '../seed/data';
import { exportActivity, exportMembers, orgReport } from './reports';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });
let orgA = '';
let orgB = '';
let ana = '';
const day = (d: string) => new Date(`${d}T15:00:00Z`);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  await seedSynthetic(db);
  const orgs = await db.select().from(schema.organizations);
  orgA = orgs.find((o) => o.name === 'Acme Demo')!.id;
  orgB = orgs.find((o) => o.name === 'Globex Demo')!.id;
  ana = (await db.select().from(schema.users)).find((u) => u.email === 'ana@example.test')!.id;
  await db.insert(schema.userTotp).values({ userId: ana, secretEncrypted: 'x', confirmedAt: new Date() });
  await db.insert(schema.auditLog).values([
    { organizationId: orgA, actorUserId: ana, action: 'a.one', createdAt: day('2026-02-01') },
    { organizationId: orgA, actorUserId: ana, action: 'a.one', createdAt: day('2026-02-01') },
    { organizationId: orgA, actorUserId: ana, action: 'a.two', createdAt: day('2026-02-03') },
    { organizationId: orgA, actorUserId: ana, action: 'a.old', createdAt: day('2025-01-01') },
    { organizationId: orgB, action: 'b.secret', createdAt: day('2026-02-01') },
    // 01:00 UTC on Feb 5 is still Feb 4 in Santo Domingo (UTC-4)
    { organizationId: orgA, action: 'a.late', createdAt: new Date('2026-02-05T01:00:00Z') },
  ]);
  await db.insert(schema.jobs).values([
    { type: 'x', payload: {}, organizationId: orgA, status: 'dead', createdAt: day('2026-02-02') },
    { type: 'x', payload: {}, organizationId: orgA, status: 'succeeded', createdAt: day('2026-02-02') },
    { type: 'x', payload: {}, organizationId: orgB, status: 'dead', createdAt: day('2026-02-02') },
  ]);
});

const range = (organizationId: string) => ({ organizationId, from: new Date('2026-02-01T00:00:00Z'), to: new Date('2026-02-28T23:59:59Z'), timeZone: 'America/Santo_Domingo' });

describe('orgReport', () => {
  it('counts members, roles and two-step adoption for the organization only', async () => {
    const r = await orgReport(db, range(orgA));
    expect(r.members.total).toBe(3);
    expect(r.members.byRole).toEqual({ owner: 2, admin: 0, member: 1 });
    expect(r.members.twoStepActive).toBe(1);
    expect((await orgReport(db, range(orgB))).members.total).toBe(1);
  });

  it('groups activity by day in the configured time zone and by action, within the range, never mixing organizations', async () => {
    const r = await orgReport(db, range(orgA));
    expect(r.activity.total).toBe(4);
    expect(r.activity.byDay).toEqual([{ day: '2026-02-01', count: 2 }, { day: '2026-02-03', count: 1 }, { day: '2026-02-04', count: 1 }]);
    expect(r.activity.byAction[0]).toEqual({ action: 'a.one', count: 2 });
    expect(r.activity.byAction.map((a) => a.action)).not.toContain('b.secret');
    expect(r.activity.byAction.map((a) => a.action)).not.toContain('a.old');
    const utc = await orgReport(db, { ...range(orgA), timeZone: 'UTC' });
    expect(utc.activity.byDay.at(-1)).toEqual({ day: '2026-02-05', count: 1 });
  });

  it('counts jobs of the organization only', async () => {
    expect((await orgReport(db, range(orgA))).jobs).toEqual({ createdInRange: 2, dead: 1 });
  });

  it('counts members who joined in the range', async () => {
    const wide = await orgReport(db, { ...range(orgA), from: new Date('2000-01-01'), to: new Date('2100-01-01') });
    expect(wide.members.newInRange).toBe(3);
    expect((await orgReport(db, { ...range(orgA), from: new Date('2000-01-01'), to: new Date('2000-12-31') })).members.newInRange).toBe(0);
  });
});

describe('exports', () => {
  it('members export lists only this organization with two-step status', async () => {
    const rows = await exportMembers(db, orgA);
    expect(rows.map((r) => r.email)).toEqual(['ana@example.test', 'beto@example.test', 'dani@example.test']);
    expect(rows.find((r) => r.email === 'ana@example.test')?.twoStep).toBe('active');
  });

  it('activity export is newest first, in range and scoped, with actor email', async () => {
    const rows = await exportActivity(db, range(orgA));
    expect(rows.map((r) => r.action)).toEqual(['a.late', 'a.two', 'a.one', 'a.one']);
    expect(rows[1]?.actorEmail).toBe('ana@example.test');
  });
});
