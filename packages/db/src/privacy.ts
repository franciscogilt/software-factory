import { and, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { recordAudit } from './audit';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const DELETION_GRACE_MS = 14 * 24 * 3_600_000;

// ---- Terms and consent -------------------------------------------------------------------------------------------

export async function hasAcceptedTerms(db: AnyDb, userId: string, version: string): Promise<boolean> {
  const [row] = await db
    .select({ v: schema.termsAcceptances.version })
    .from(schema.termsAcceptances)
    .where(and(eq(schema.termsAcceptances.userId, userId), eq(schema.termsAcceptances.version, version)));
  return Boolean(row);
}

export async function acceptTerms(db: AnyDb, userId: string, version: string, now: Date = new Date()): Promise<void> {
  await db.insert(schema.termsAcceptances).values({ userId, version, acceptedAt: now }).onConflictDoNothing();
}

export async function recordConsent(db: AnyDb, input: { userId: string; category: string; granted: boolean; policyVersion: string; now?: Date }): Promise<void> {
  await db.insert(schema.consents).values({ ...input, createdAt: input.now ?? new Date() });
}

// The latest decision per category. No row means no consent was given.
export async function currentConsent(db: AnyDb, userId: string): Promise<Record<string, boolean>> {
  const rows = await db.select().from(schema.consents).where(eq(schema.consents.userId, userId)).orderBy(desc(schema.consents.id));
  const result: Record<string, boolean> = {};
  for (const r of rows) if (!(r.category in result)) result[r.category] = r.granted;
  return result;
}

// ---- Export ------------------------------------------------------------------------------------------------------

// Everything we hold about one person, and only that person. Secrets (tokens, TOTP secret, recovery hashes) are never included.
export async function exportUserData(db: AnyDb, userId: string, now: Date = new Date()) {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, emailVerified: schema.users.emailVerified, createdAt: schema.users.createdAt, deletionRequestedAt: schema.users.deletionRequestedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user) return null;
  const [providers, memberships, terms, consents, activity, totp, sessionCount] = await Promise.all([
    db.select({ provider: schema.accounts.provider }).from(schema.accounts).where(eq(schema.accounts.userId, userId)),
    db
      .select({ organization: schema.organizations.name, role: schema.memberships.role, since: schema.memberships.createdAt })
      .from(schema.memberships)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
      .where(eq(schema.memberships.userId, userId)),
    db.select({ version: schema.termsAcceptances.version, acceptedAt: schema.termsAcceptances.acceptedAt }).from(schema.termsAcceptances).where(eq(schema.termsAcceptances.userId, userId)),
    db.select({ category: schema.consents.category, granted: schema.consents.granted, policyVersion: schema.consents.policyVersion, at: schema.consents.createdAt }).from(schema.consents).where(eq(schema.consents.userId, userId)),
    db
      .select({ at: schema.auditLog.createdAt, action: schema.auditLog.action, targetType: schema.auditLog.targetType })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.actorUserId, userId))
      .orderBy(desc(schema.auditLog.id))
      .limit(5000),
    db.select({ confirmedAt: schema.userTotp.confirmedAt }).from(schema.userTotp).where(eq(schema.userTotp.userId, userId)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(schema.sessions).where(eq(schema.sessions.userId, userId)),
  ]);
  return {
    exportedAt: now.toISOString(),
    profile: user,
    signInProviders: providers.map((p) => p.provider),
    twoStepEnabled: Boolean(totp[0]?.confirmedAt),
    activeSessions: sessionCount[0]?.n ?? 0,
    memberships,
    termsAcceptances: terms,
    consents,
    actionsPerformed: activity,
  };
}

// ---- Deletion ----------------------------------------------------------------------------------------------------

// Organizations where this person is the only owner. Deleting them would leave the organization without an owner.
export async function soleOwnerOrganizations(db: AnyDb, userId: string): Promise<{ id: string; name: string }[]> {
  const owned = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.role, 'owner')));
  if (owned.length === 0) return [];
  const owners = await db
    .select({ organizationId: schema.memberships.organizationId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.memberships)
    .where(and(inArray(schema.memberships.organizationId, owned.map((o) => o.id)), eq(schema.memberships.role, 'owner')))
    .groupBy(schema.memberships.organizationId);
  const count = new Map(owners.map((o) => [o.organizationId, o.n]));
  return owned.filter((o) => (count.get(o.id) ?? 0) <= 1);
}

export type DeletionRequest =
  | { ok: true; scheduledFor: Date; email: string | null }
  | { ok: false; reason: 'sole_owner'; organizations: { id: string; name: string }[] }
  | { ok: false; reason: 'not_found' };

// Marks the account for deletion and ends every session. Asking twice keeps the original date.
export async function requestAccountDeletion(db: AnyDb, userId: string, now: Date = new Date()): Promise<DeletionRequest> {
  const [user] = await db.select({ email: schema.users.email, pending: schema.users.deletionRequestedAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.pending) return { ok: true, scheduledFor: new Date(user.pending.getTime() + DELETION_GRACE_MS), email: user.email };
  const blocking = await soleOwnerOrganizations(db, userId);
  if (blocking.length > 0) return { ok: false, reason: 'sole_owner', organizations: blocking };
  await db.update(schema.users).set({ deletionRequestedAt: now }).where(eq(schema.users.id, userId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await recordAudit(db, { actorUserId: userId, action: 'privacy.deletion_requested', targetType: 'user', targetId: userId });
  return { ok: true, scheduledFor: new Date(now.getTime() + DELETION_GRACE_MS), email: user.email };
}

export async function cancelAccountDeletion(db: AnyDb, userId: string): Promise<boolean> {
  const rows = await db
    .update(schema.users)
    .set({ deletionRequestedAt: null })
    .where(and(eq(schema.users.id, userId), isNotNull(schema.users.deletionRequestedAt)))
    .returning({ id: schema.users.id });
  if (rows.length === 0) return false;
  await recordAudit(db, { actorUserId: userId, action: 'privacy.deletion_cancelled', targetType: 'user', targetId: userId });
  return true;
}

export async function deletionStatus(db: AnyDb, userId: string): Promise<{ scheduledFor: Date } | null> {
  const [user] = await db.select({ pending: schema.users.deletionRequestedAt }).from(schema.users).where(eq(schema.users.id, userId));
  return user?.pending ? { scheduledFor: new Date(user.pending.getTime() + DELETION_GRACE_MS) } : null;
}

export type PurgeResult = { purged: { userId: string; email: string | null }[]; blocked: string[] };

// Erases accounts whose grace period is over. The audit log keeps only the orphaned id (ADR 0002).
export async function purgeDueAccounts(db: AnyDb, now: Date = new Date()): Promise<PurgeResult> {
  const due = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(lte(schema.users.deletionRequestedAt, new Date(now.getTime() - DELETION_GRACE_MS)));
  const result: PurgeResult = { purged: [], blocked: [] };
  for (const user of due) {
    // If the person became the only owner during the grace period, keep the account until that is resolved.
    if ((await soleOwnerOrganizations(db, user.id)).length > 0) { result.blocked.push(user.id); continue; }
    await db.transaction(async (tx) => {
      if (user.email) {
        await tx.delete(schema.verificationTokens).where(eq(schema.verificationTokens.identifier, user.email));
        await tx.delete(schema.rateLimits).where(eq(schema.rateLimits.key, `signin-email:${user.email.toLowerCase()}`));
        // Pending or dead emails addressed to this person would keep their address in the queue.
        await tx.delete(schema.jobs).where(and(inArray(schema.jobs.status, ['queued', 'dead']), sql`${schema.jobs.payload}->>'to' = ${user.email}`));
      }
      await tx.delete(schema.users).where(eq(schema.users.id, user.id)); // cascades to every table that references the user
      await recordAudit(tx, { action: 'privacy.account_purged', targetType: 'user', targetId: user.id });
    });
    result.purged.push({ userId: user.id, email: user.email });
  }
  return result;
}
