import { randomUUID } from 'node:crypto';
import { createDb, memberships, mfaSessions, sessions, termsAcceptances, userTotp, users, organizations } from '@factory/db';
import { eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import type { BrowserContext } from '@playwright/test';
import { env } from '../playwright.config';
import { TERMS_VERSION } from '../../web/src/lib/terms';
import { decryptSecret, encryptSecret, newTotpSecret } from '../../web/src/lib/mfa';

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
export async function signInAs(context: BrowserContext, email: string, options: { acceptTerms?: boolean } = {}): Promise<string> {
  const userId = await userIdByEmail(email);
  // Test users have already accepted the current terms, like real users who signed in before; pass acceptTerms: false to test the gate.
  if (options.acceptTerms !== false) await db.insert(termsAcceptances).values({ userId, version: TERMS_VERSION }).onConflictDoNothing();
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

// Enrolls a user in two-step verification and marks the given session as verified, without going through the UI.
export async function enrollAndVerify(email: string, sessionToken: string): Promise<void> {
  const userId = await userIdByEmail(email);
  await db
    .insert(userTotp)
    .values({ userId, secretEncrypted: encryptSecret(newTotpSecret(), env.MFA_ENCRYPTION_KEY), confirmedAt: new Date() })
    .onConflictDoNothing();
  await db.insert(mfaSessions).values({ sessionToken }).onConflictDoNothing();
}

// Creates a throwaway person (and optionally a new organization they solely own) for tests that change or delete accounts,
// so the shared synthetic users stay intact for other specs.
export async function createTestUser(email: string, options: { soleOwnerOf?: string } = {}): Promise<{ userId: string; organizationId: string }> {
  const [user] = await db.insert(users).values({ name: email.split('@')[0], email }).onConflictDoNothing().returning();
  const userId = user?.id ?? (await userIdByEmail(email));
  let organizationId: string;
  if (options.soleOwnerOf) {
    const [org] = await db.insert(organizations).values({ name: options.soleOwnerOf }).returning();
    organizationId = org!.id;
    await db.insert(memberships).values({ organizationId, userId, role: 'owner' });
  } else {
    organizationId = await orgIdByName('Acme Demo');
    await db.insert(memberships).values({ organizationId, userId, role: 'member' }).onConflictDoNothing();
  }
  return { userId, organizationId };
}
