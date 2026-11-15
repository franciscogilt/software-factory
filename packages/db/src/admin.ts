import { and, eq, inArray } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { authorize } from './authz';
import { recordAudit } from './audit';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: 'not_allowed' | 'mfa_required' | 'cannot_reset_self' | 'target_not_member' };

// Another owner of the same organization resets a colleague's two-step verification.
// All of the target's sessions end, so they sign in again and enroll a new authenticator.
export async function resetTwoStep(
  db: AnyDb,
  input: { actorUserId: string; actorSessionToken: string; organizationId: string; targetUserId: string },
): Promise<ResetResult> {
  const allowed = await authorize(db, {
    userId: input.actorUserId,
    organizationId: input.organizationId,
    minimumRole: 'owner',
    sessionToken: input.actorSessionToken,
  });
  if (!allowed.allowed) return { ok: false, reason: allowed.reason === 'mfa_required' ? 'mfa_required' : 'not_allowed' };
  if (input.targetUserId === input.actorUserId) return { ok: false, reason: 'cannot_reset_self' };

  const [member] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.organizationId, input.organizationId), eq(schema.memberships.userId, input.targetUserId)));
  if (!member) return { ok: false, reason: 'target_not_member' };

  const targetSessions = await db
    .select({ token: schema.sessions.sessionToken })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, input.targetUserId));
  if (targetSessions.length > 0) {
    await db.delete(schema.sessions).where(inArray(schema.sessions.sessionToken, targetSessions.map((s) => s.token)));
  }
  await db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, input.targetUserId));
  await db.delete(schema.userTotp).where(eq(schema.userTotp.userId, input.targetUserId));
  await recordAudit(db, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'mfa.reset_by_owner',
    targetType: 'user',
    targetId: input.targetUserId,
  });
  return { ok: true };
}

export type MemberRow = { userId: string; email: string | null; name: string | null; role: schema.Role; twoStep: 'active' | 'pending' | 'off' };

export async function listMembers(db: AnyDb, organizationId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.memberships.role,
      confirmedAt: schema.userTotp.confirmedAt,
      hasTotp: schema.userTotp.userId,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .leftJoin(schema.userTotp, eq(schema.userTotp.userId, schema.users.id))
    .where(eq(schema.memberships.organizationId, organizationId));
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role,
    twoStep: r.confirmedAt ? 'active' : r.hasTotp ? 'pending' : 'off',
  }));
}
