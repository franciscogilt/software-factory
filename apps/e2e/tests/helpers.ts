import { randomUUID } from 'node:crypto';
import { createDb, sessions, userTotp, users, organizations } from '@factory/db';
import { eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import type { BrowserContext } from '@playwright/test';
import { env } from '../playwright.config';
import { decryptSecret } from '../../web/src/lib/mfa';

export const { db } = createDb(env.DATABASE_URL);

export async function userIdByEmail(email: string): Promise<string> {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`No user ${email}`);
  return u.id;
}

export async function orgIdByName(name: string): Promise<string> {
  const [o] = await db.select().from(organizations).where(eq(organizations.name, name));
  if (!o) throw new Error(`No org ${name}`);
  return o.id;
}

// Signs a user in by creating a database session and setting its cookie.
// This skips the email/Google step (covered separately) so tests can focus on authorization and 2FA.
export async function signInAs(context: BrowserContext, email: string): Promise<string> {
  const userId = await userIdByEmail(email);
  const sessionToken = randomUUID();
  await db.insert(sessions).values({ sessionToken, userId, expires: new Date(Date.now() + 3600_000) });
  await context.addCookies([{ name: 'authjs.session-token', value: sessionToken, domain: 'localhost', path: '/' }]);
  return sessionToken;
}

export async function currentTotpCode(email: string): Promise<string> {
  const userId = await userIdByEmail(email);
  const [row] = await db.select().from(userTotp).where(eq(userTotp.userId, userId));
  if (!row) throw new Error('Not enrolled');
  return authenticator.generate(decryptSecret(row.secretEncrypted, env.MFA_ENCRYPTION_KEY));
}
