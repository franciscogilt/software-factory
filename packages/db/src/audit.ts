import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type AuditEvent = {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export async function recordAudit(db: AnyDb, event: AuditEvent): Promise<void> {
  await db.insert(schema.auditLog).values({
    organizationId: event.organizationId ?? null,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    metadata: event.metadata ?? null,
  });
}

// Newest first. Always scoped to one organization; optional date range for the admin filters.
export async function listAudit(db: AnyDb, input: { organizationId: string; from?: Date; to?: Date; limit?: number }) {
  const filters = [eq(schema.auditLog.organizationId, input.organizationId)];
  if (input.from) filters.push(gte(schema.auditLog.createdAt, input.from));
  if (input.to) filters.push(lte(schema.auditLog.createdAt, input.to));
  return db
    .select()
    .from(schema.auditLog)
    .where(and(...filters))
    .orderBy(desc(schema.auditLog.id))
    .limit(Math.min(input.limit ?? 100, 500));
}
