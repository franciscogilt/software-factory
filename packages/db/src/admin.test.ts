import { PGlite } from '@electric-sql/pglite';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedSynthetic } from '../seed/data';
import { listMembers, resetTwoStep } from './admin';
import { listAudit, recordAudit } from './audit';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });
const id: Record<string, string> = {};
let orgA = '';
let orgB = '';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  await seedSynthetic(db);
  for (const u of await db.select().from(schema.users)) id[u.email!.split('@')[0]!] = u.id;
  const orgs = await db.select().from(schema.organizations);
  orgA = orgs.find((o) => o.name === 'Acme Demo')!.id;
  orgB = orgs.find((o) => o.name === 'Globex Demo')!.id;
  const expires = new Date(Date.now() + 3600_000);
  await db.insert(schema.sessions).values([
    { sessionToken: 'dani-mfa', userId: id.dani!, expires },
    { sessionToken: 'dani-plain', userId: id.dani!, expires },
    { sessionToken: 'beto-s', userId: id.beto!, expires },
    { sessionToken: 'ana-s', userId: id.ana!, expires },
    { sessionToken: 'carla-mfa', userId: id.carla!, expires },
  ]);
  await db.insert(schema.mfaSessions).values([{ sessionToken: 'dani-mfa' }, { sessionToken: 'carla-mfa' }]);
  await db.insert(schema.userTotp).values({ userId: id.ana!, secretEncrypted: 'x', confirmedAt: new Date() });
  await db.insert(schema.recoveryCodes).values({ userId: id.ana!, codeHash: 'h' });
});

describe('audit log', () => {
  it('records events and lists them per organization, newest first', async () => {
    await recordAudit(db, { organizationId: orgA, actorUserId: id.ana, action: 'test.one' });
    await recordAudit(db, { organizationId: orgA, actorUserId: id.ana, action: 'test.two', metadata: { a: 1 } });
    await recordAudit(db, { organizationId: orgB, actorUserId: id.carla, action: 'test.other-org' });
    const rows = await listAudit(db, { organizationId: orgA });
    expect(rows.map((r) => r.action)).toEqual(['test.two', 'test.one']);
  });

  it('refuses to update, delete or truncate entries', async () => {
    await expect(db.update(schema.auditLog).set({ action: 'tampered' })).rejects.toThrow();
    await expect(db.delete(schema.auditLog)).rejects.toThrow();
    await expect(db.execute(sql`TRUNCATE "audit_log"`)).rejects.toThrow();
    expect((await db.select().from(schema.auditLog)).length).toBe(3);
  });

  it('keeps history when the actor is deleted', async () => {
    await db.insert(schema.users).values({ id: 'temp-user', email: 'temp@example.test' });
    await recordAudit(db, { organizationId: orgA, actorUserId: 'temp-user', action: 'test.temp' });
    await db.delete(schema.users).where(eq(schema.users.id, 'temp-user'));
    const rows = await listAudit(db, { organizationId: orgA });
    expect(rows.some((r) => r.action === 'test.temp')).toBe(true);
  });
});

describe('resetTwoStep', () => {
  const base = () => ({ organizationId: orgA, targetUserId: id.ana! });

  it('denies members and admins without owner role', async () => {
    expect(await resetTwoStep(db, { ...base(), actorUserId: id.beto!, actorSessionToken: 'beto-s' })).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('denies an owner of another organization', async () => {
    expect(await resetTwoStep(db, { ...base(), actorUserId: id.carla!, actorSessionToken: 'carla-mfa' })).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('requires the owner session to be verified in two steps', async () => {
    expect(await resetTwoStep(db, { ...base(), actorUserId: id.dani!, actorSessionToken: 'dani-plain' })).toEqual({ ok: false, reason: 'mfa_required' });
  });

  it('refuses to reset yourself', async () => {
    expect(await resetTwoStep(db, { organizationId: orgA, targetUserId: id.dani!, actorUserId: id.dani!, actorSessionToken: 'dani-mfa' })).toEqual({ ok: false, reason: 'cannot_reset_self' });
  });

  it('refuses a target outside the organization', async () => {
    expect(await resetTwoStep(db, { organizationId: orgA, targetUserId: id.carla!, actorUserId: id.dani!, actorSessionToken: 'dani-mfa' })).toEqual({ ok: false, reason: 'target_not_member' });
  });

  it('resets the target: secret, recovery codes and sessions are removed, and it is audited', async () => {
    expect(await resetTwoStep(db, { ...base(), actorUserId: id.dani!, actorSessionToken: 'dani-mfa' })).toEqual({ ok: true });
    expect(await db.select().from(schema.userTotp).where(eq(schema.userTotp.userId, id.ana!))).toHaveLength(0);
    expect(await db.select().from(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, id.ana!))).toHaveLength(0);
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, id.ana!))).toHaveLength(0);
    const log = await listAudit(db, { organizationId: orgA });
    expect(log[0]).toMatchObject({ action: 'mfa.reset_by_owner', actorUserId: id.dani, targetId: id.ana });
  });
});

describe('listMembers', () => {
  it('shows two-step status per member', async () => {
    const rows = await listMembers(db, orgA);
    expect(rows.find((r) => r.userId === id.ana)?.twoStep).toBe('off');
    expect(rows.map((r) => r.email).sort()).toEqual(['ana@example.test', 'beto@example.test', 'dani@example.test']);
  });
});
