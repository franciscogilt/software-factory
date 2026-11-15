import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

export * from './schema';
export * from './authz';
export * from './mfa';

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>['db'];
export * from './audit';
export * from './admin';

// Works with any PostgreSQL driver (postgres-js in production, PGlite in tests).
export type AnyPgDb = PgDatabase<PgQueryResultHKT, typeof schema>;
export * from './rate-limit';
