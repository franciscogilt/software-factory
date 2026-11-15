import { bigint, bigserial, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
