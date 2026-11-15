import { bigint, bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Auth.js tables (shape required by @auth/drizzle-adapter).
export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// Multi-tenant model: every business row belongs to an organization.
export const roleEnum = pgEnum('role', ['owner', 'admin', 'member']);
export type Role = (typeof roleEnum.enumValues)[number];

export const organizations = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'membership',
  {
    organizationId: uuid('organizationId').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('member'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);

// Two-step verification (TOTP). The secret is stored encrypted; see apps/web/src/lib/mfa.ts.
export const userTotp = pgTable('user_totp', {
  userId: text('userId').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  secretEncrypted: text('secretEncrypted').notNull(),
  confirmedAt: timestamp('confirmedAt', { mode: 'date' }),
  failedAttempts: integer('failedAttempts').notNull().default(0),
  lockedUntil: timestamp('lockedUntil', { mode: 'date' }),
  // Last accepted 30-second time step; a code from the same or an older step is a replay and is rejected.
  lastUsedStep: bigint('lastUsedStep', { mode: 'number' }),
});

// A session counts as verified only if it has a row here. Deleted with the session.
export const mfaSessions = pgTable('mfa_session', {
  sessionToken: text('sessionToken').primaryKey().references(() => sessions.sessionToken, { onDelete: 'cascade' }),
  verifiedAt: timestamp('verifiedAt', { mode: 'date' }).notNull().defaultNow(),
});

// One-time recovery codes, stored only as hashes.
export const recoveryCodes = pgTable(
  'recovery_code',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('codeHash').notNull(),
    usedAt: timestamp('usedAt', { mode: 'date' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.codeHash] })],
);

// Append-only record of who did what. A database trigger rejects UPDATE and DELETE.
// actorUserId and organizationId are plain columns (no foreign keys) so history survives deletions.
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  organizationId: uuid('organizationId'),
  actorUserId: text('actorUserId'),
  action: text('action').notNull(),
  targetType: text('targetType'),
  targetId: text('targetId'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
});

// Background jobs on PostgreSQL: retries with growing delays, one-time delivery by idempotency key.
export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'succeeded', 'dead']);

export const jobs = pgTable('job', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  organizationId: uuid('organizationId'),
  status: jobStatusEnum('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('maxAttempts').notNull().default(5),
  runAt: timestamp('runAt', { mode: 'date' }).notNull().defaultNow(),
  lockedAt: timestamp('lockedAt', { mode: 'date' }),
  lastError: text('lastError'),
  idempotencyKey: text('idempotencyKey').unique(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  finishedAt: timestamp('finishedAt', { mode: 'date' }),
});

// Attempt limits with progressive blocking (login links, recovery). One row per key.
export const rateLimits = pgTable('rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('windowStart', { mode: 'date' }).notNull(),
  strikes: integer('strikes').notNull().default(0),
  blockedUntil: timestamp('blockedUntil', { mode: 'date' }),
});

// Outcome and duration of critical flows (sign-in link, two-step verification...). Feeds metrics and alerts.
export const flowMetrics = pgTable(
  'flow_metric',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    flow: text('flow').notNull(),
    outcome: text('outcome').notNull(), // 'success' | 'failure' | 'limited' (expected refusals are not failures)
    durationMs: integer('durationMs').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [index('flow_metric_created_idx').on(t.createdAt)],
);

// One row per alert condition, so an ongoing problem sends one message (and a reminder), not one per check.
export const alertState = pgTable('alert_state', {
  key: text('key').primaryKey(),
  active: boolean('active').notNull().default(false),
  firedAt: timestamp('firedAt', { mode: 'date' }),
  lastNotifiedAt: timestamp('lastNotifiedAt', { mode: 'date' }),
  detail: text('detail'),
});
