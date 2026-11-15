import { and, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export type { Role } from './schema';
import type { Role } from './schema';

const rank: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return rank[role] >= rank[minimum];
}

export function isAdminRole(role: Role): boolean {
  return roleAtLeast(role, 'admin');
}

export type AuthzResult =
  | { allowed: true; role: Role }
  | { allowed: false; reason: 'not_member' | 'insufficient_role' | 'mfa_required' };

// Authorization is always checked on the server and always scoped to one organization.
// Administrators must have a session verified with a second step.
export async function authorize(
  db: AnyDb,
  input: { userId: string; organizationId: string; minimumRole: Role; sessionToken: string },
): Promise<AuthzResult> {
  // A person whose account is scheduled for deletion cannot use any organization.
  const [account] = await db.select({ pending: schema.users.deletionRequestedAt }).from(schema.users).where(eq(schema.users.id, input.userId));
  if (!account || account.pending) return { allowed: false, reason: 'not_member' };
  const [membership] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, input.userId), eq(schema.memberships.organizationId, input.organizationId)));
  if (!membership) return { allowed: false, reason: 'not_member' };
  if (!roleAtLeast(membership.role, input.minimumRole)) return { allowed: false, reason: 'insufficient_role' };
  if (isAdminRole(membership.role)) {
    const [verified] = await db
      .select({ token: schema.mfaSessions.sessionToken })
      .from(schema.mfaSessions)
      .where(eq(schema.mfaSessions.sessionToken, input.sessionToken));
    if (!verified) return { allowed: false, reason: 'mfa_required' };
  }
  return { allowed: true, role: membership.role };
}
