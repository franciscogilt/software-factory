import { execFileSync } from 'node:child_process';
import { createDb } from '@factory/db';
import { sql } from 'drizzle-orm';
import { seedSynthetic } from '../../packages/db/seed/data';
import { env } from './playwright.config';

// Applies migrations through the same job used in deployment, then resets to a known synthetic dataset.
export default async function globalSetup() {
  execFileSync('pnpm', ['--filter', '@factory/db', 'migrate'], { env: { ...process.env, ...env }, stdio: 'inherit' });
  const { db, close } = createDb(env.DATABASE_URL);
  await db.execute(sql`TRUNCATE "user", "organization", "rate_limit", "job" CASCADE`);
  await seedSynthetic(db);
  await close();
}
