import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export const EXPORT_ROW_LIMIT = 10_000;

export type ReportRange = { organizationId: string; from: Date; to: Date; timeZone: string };

export type OrgReport = {
  members: { total: number; byRole: Record<schema.Role, number>; twoStepActive: number; newInRange: number };
  activity: { total: number; byDay: { day: string; count: number }[]; byAction: { action: string; count: number }[] };
  jobs: { createdInRange: number; dead: number };
};

// Everything here is filtered by organization first: a report can never include another customer's data.
export async function orgReport(db: AnyDb, r: ReportRange): Promise<OrgReport> {
  const memberRows = await db
    .select({ role: schema.memberships.role, createdAt: schema.memberships.createdAt, confirmedAt: schema.userTotp.confirmedAt })
    .from(schema.memberships)
    .leftJoin(schema.userTotp, eq(schema.userTotp.userId, schema.memberships.userId))
    .where(eq(schema.memberships.organizationId, r.organizationId));
  const byRole: Record<schema.Role, number> = { owner: 0, admin: 0, member: 0 };
  for (const m of memberRows) byRole[m.role]++;

  const inRange = and(eq(schema.auditLog.organizationId, r.organizationId), gte(schema.auditLog.createdAt, r.from), lte(schema.auditLog.createdAt, r.to));
  const dayExpr = sql<string>`to_char((${schema.auditLog.createdAt} at time zone 'UTC') at time zone ${r.timeZone}, 'YYYY-MM-DD')`;
  const byDay = await db
    .select({ day: dayExpr, count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.auditLog)
    .where(inRange)
    // Group and order by the first column: repeating the expression would bind the time zone as separate parameters.
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const byAction = await db
    .select({ action: schema.auditLog.action, count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.auditLog)
    .where(inRange)
    .groupBy(schema.auditLog.action)
    .orderBy(desc(sql`count(*)`), asc(schema.auditLog.action))
    .limit(10);

  // Dates inside raw SQL fragments are passed as ISO strings: the production driver cannot bind Date objects there.
  const [jobStats] = await db
    .select({
      createdInRange: sql<number>`count(*) filter (where ${schema.jobs.createdAt} >= ${r.from.toISOString()}::timestamptz and ${schema.jobs.createdAt} <= ${r.to.toISOString()}::timestamptz)`.mapWith(Number),
      dead: sql<number>`count(*) filter (where ${schema.jobs.status} = 'dead')`.mapWith(Number),
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.organizationId, r.organizationId));

  return {
    members: {
      total: memberRows.length,
      byRole,
      twoStepActive: memberRows.filter((m) => m.confirmedAt).length,
      newInRange: memberRows.filter((m) => m.createdAt >= r.from && m.createdAt <= r.to).length,
    },
    activity: { total: byDay.reduce((n, d) => n + d.count, 0), byDay, byAction },
    jobs: { createdInRange: jobStats?.createdInRange ?? 0, dead: jobStats?.dead ?? 0 },
  };
}

export type MemberExportRow = { name: string | null; email: string | null; role: schema.Role; twoStep: 'active' | 'pending' | 'off'; joinedAt: Date };

export async function exportMembers(db: AnyDb, organizationId: string): Promise<MemberExportRow[]> {
  const rows = await db
    .select({ name: schema.users.name, email: schema.users.email, role: schema.memberships.role, joinedAt: schema.memberships.createdAt, confirmedAt: schema.userTotp.confirmedAt, hasTotp: schema.userTotp.userId })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .leftJoin(schema.userTotp, eq(schema.userTotp.userId, schema.users.id))
    .where(eq(schema.memberships.organizationId, organizationId))
    .orderBy(asc(schema.users.email))
    .limit(EXPORT_ROW_LIMIT);
  return rows.map((r) => ({ name: r.name, email: r.email, role: r.role, joinedAt: r.joinedAt, twoStep: r.confirmedAt ? 'active' : r.hasTotp ? 'pending' : 'off' }));
}

export type ActivityExportRow = { at: Date; action: string; actorEmail: string | null; targetType: string | null; targetId: string | null };

export async function exportActivity(db: AnyDb, r: Omit<ReportRange, 'timeZone'>): Promise<ActivityExportRow[]> {
  return db
    .select({ at: schema.auditLog.createdAt, action: schema.auditLog.action, actorEmail: schema.users.email, targetType: schema.auditLog.targetType, targetId: schema.auditLog.targetId })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorUserId))
    .where(and(eq(schema.auditLog.organizationId, r.organizationId), gte(schema.auditLog.createdAt, r.from), lte(schema.auditLog.createdAt, r.to)))
    .orderBy(desc(schema.auditLog.id))
    .limit(EXPORT_ROW_LIMIT);
}
