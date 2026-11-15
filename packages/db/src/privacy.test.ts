import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedSynthetic } from '../seed/data';
import { authorize } from './authz';
import {
  acceptTerms, cancelAccountDeletion, currentConsent, DELETION_GRACE_MS, deletionStatus, exportUserData, hasAcceptedTerms,
  purgeDueAccounts, recordConsent, requestAccountDeletion, soleOwnerOrganizations,
} from './privacy';
import * as schema from './schema';

const db = drizzle(new PGlite(), { schema });
const id: Record<string, string> = {};
let orgA = '';
let orgB = '';
const t0 = new Date('2026-03-01T12:00:00Z');
const after = (ms: number) => new Date(t0.getTime() + ms);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
  await seedSynthetic(db);
  for (const u of await db.select().from(schema.users)) id[u.email!.split('@')[0]!] = u.id;
  const orgs = await db.select().from(schema.organizations);
  orgA = orgs.find((o) => o.name === 'Acme Demo')!.id;
  orgB = orgs.find((o) => o.name === 'Globex Demo')!.id;
});

describe('terms and consent', () => {
  it('records acceptance per version', async () => {
    expect(await hasAcceptedTerms(db, id.beto!, 'v1')).toBe(false);
    await acceptTerms(db, id.beto!, 'v1');
    await acceptTerms(db, id.beto!, 'v1'); // idempotent
    expect(await hasAcceptedTerms(db, id.beto!, 'v1')).toBe(true);
    expect(await hasAcceptedTerms(db, id.beto!, 'v2')).toBe(false);
  });

  it('keeps every consent decision and reports the latest per category', async () => {
    expect(await currentConsent(db, id.beto!)).toEqual({});
    await recordConsent(db, { userId: id.beto!, category: 'analytics', granted: true, policyVersion: 'v1' });
    await recordConsent(db, { userId: id.beto!, category: 'analytics', granted: false, policyVersion: 'v1' });
    expect(await currentConsent(db, id.beto!)).toEqual({ analytics: false });
    expect(await db.select().from(schema.consents).where(eq(schema.consents.userId, id.beto!))).toHaveLength(2);
  });
});

describe('export', () => {
  it('contains the person data and never secrets or other people', async () => {
    await db.insert(schema.accounts).values({ userId: id.beto!, type: 'oauth', provider: 'google', providerAccountId: 'g-1', access_token: 'SECRET-ACCESS', refresh_token: 'SECRET-REFRESH' });
    await db.insert(schema.userTotp).values({ userId: id.beto!, secretEncrypted: 'SECRET-TOTP', confirmedAt: t0 });
    await db.insert(schema.recoveryCodes).values({ userId: id.beto!, codeHash: 'SECRET-HASH' });
    await db.insert(schema.auditLog).values([
      { organizationId: orgA, actorUserId: id.beto!, action: 'beto.did.this' },
      { organizationId: orgA, actorUserId: id.ana!, action: 'ana.did.that' },
    ]);
    const data = (await exportUserData(db, id.beto!, t0))!;
    const text = JSON.stringify(data);
    expect(data.profile.email).toBe('beto@example.test');
    expect(data.signInProviders).toEqual(['google']);
    expect(data.twoStepEnabled).toBe(true);
    expect(data.memberships).toEqual([expect.objectContaining({ organization: 'Acme Demo', role: 'member' })]);
    expect(data.actionsPerformed.map((a) => a.action)).toEqual(['beto.did.this']);
    for (const secret of ['SECRET-ACCESS', 'SECRET-REFRESH', 'SECRET-TOTP', 'SECRET-HASH', 'ana@example.test', 'ana.did.that']) expect(text).not.toContain(secret);
  });

  it('returns null for an unknown user', async () => {
    expect(await exportUserData(db, 'nobody')).toBeNull();
  });
});

describe('deletion', () => {
  it('blocks the only owner of an organization, naming it', async () => {
    expect(await soleOwnerOrganizations(db, id.carla!)).toEqual([{ id: orgB, name: 'Globex Demo' }]);
    expect(await soleOwnerOrganizations(db, id.ana!)).toEqual([]); // Acme has two owners
    const result = await requestAccountDeletion(db, id.carla!, t0);
    expect(result).toEqual({ ok: false, reason: 'sole_owner', organizations: [{ id: orgB, name: 'Globex Demo' }] });
    expect(await deletionStatus(db, id.carla!)).toBeNull();
  });

  it('schedules deletion, ends sessions, blocks organization access, and can be cancelled', async () => {
    await db.insert(schema.sessions).values({ sessionToken: 'beto-s', userId: id.beto!, expires: after(3_600_000) });
    const before = await authorize(db, { userId: id.beto!, organizationId: orgA, minimumRole: 'member', sessionToken: 'beto-s' });
    expect(before.allowed).toBe(true);

    const result = await requestAccountDeletion(db, id.beto!, t0);
    expect(result).toEqual({ ok: true, scheduledFor: after(DELETION_GRACE_MS), email: 'beto@example.test' });
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, id.beto!))).toHaveLength(0);
    expect((await authorize(db, { userId: id.beto!, organizationId: orgA, minimumRole: 'member', sessionToken: 'x' })).allowed).toBe(false);
    // Asking again keeps the original date.
    expect(await requestAccountDeletion(db, id.beto!, after(5 * 86_400_000))).toMatchObject({ ok: true, scheduledFor: after(DELETION_GRACE_MS) });

    expect(await cancelAccountDeletion(db, id.beto!)).toBe(true);
    expect(await cancelAccountDeletion(db, id.beto!)).toBe(false);
    expect((await authorize(db, { userId: id.beto!, organizationId: orgA, minimumRole: 'member', sessionToken: 'x' })).allowed).toBe(true);
    const actions = (await db.select().from(schema.auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['privacy.deletion_requested', 'privacy.deletion_cancelled']));
  });

  it('does not purge before the grace period ends, then erases everything about the person', async () => {
    await requestAccountDeletion(db, id.beto!, t0);
    await db.insert(schema.verificationTokens).values({ identifier: 'beto@example.test', token: 't', expires: after(1000) });
    await db.insert(schema.rateLimits).values({ key: 'signin-email:beto@example.test', count: 1, windowStart: t0 });
    await db.insert(schema.jobs).values([
      { type: 'email.send', payload: { to: 'beto@example.test', subject: 's', text: 't' }, status: 'dead' },
      { type: 'email.send', payload: { to: 'ana@example.test', subject: 's', text: 't' }, status: 'queued' },
    ]);

    expect((await purgeDueAccounts(db, after(DELETION_GRACE_MS - 1000))).purged).toEqual([]);
    const result = await purgeDueAccounts(db, after(DELETION_GRACE_MS));
    expect(result.purged).toEqual([{ userId: id.beto!, email: 'beto@example.test' }]);

    expect(await db.select().from(schema.users).where(eq(schema.users.id, id.beto!))).toHaveLength(0);
    for (const table of [schema.memberships, schema.termsAcceptances, schema.consents, schema.userTotp, schema.recoveryCodes, schema.accounts]) {
      expect(await db.select().from(table).where(eq(table.userId, id.beto!))).toHaveLength(0);
    }
    expect(await db.select().from(schema.verificationTokens)).toHaveLength(0);
    expect(await db.select().from(schema.rateLimits)).toHaveLength(0);
    const jobsLeft = await db.select().from(schema.jobs);
    expect(jobsLeft.map((j) => j.payload.to)).toEqual(['ana@example.test']); // other people's mail untouched

    // The audit log keeps the orphaned id and a purge record, and nothing personal.
    const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.actorUserId, id.beto!));
    expect(audit.length).toBeGreaterThan(0);
    const purged = (await db.select().from(schema.auditLog)).find((a) => a.action === 'privacy.account_purged');
    expect(purged?.targetId).toBe(id.beto);
    expect(JSON.stringify(await db.select().from(schema.auditLog))).not.toContain('beto@example.test');
  });

  it('keeps an account whose owner became the sole owner during the grace period', async () => {
    await requestAccountDeletion(db, id.ana!, t0); // Acme has two owners at request time
    await db.delete(schema.memberships).where(eq(schema.memberships.userId, id.dani!)); // the other owner leaves
    const result = await purgeDueAccounts(db, after(DELETION_GRACE_MS));
    expect(result).toEqual({ purged: [], blocked: [id.ana!] });
    expect(await db.select().from(schema.users).where(eq(schema.users.id, id.ana!))).toHaveLength(1);
  });
});
