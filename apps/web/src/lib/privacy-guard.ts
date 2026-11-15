import { mfaSessions, userTotp } from '@factory/db';
import { eq } from 'drizzle-orm';
import { getDb } from './guard';

// Sensitive personal-data actions need a verified second step when the person has one set up.
export async function secondStepMissing(userId: string, sessionToken: string): Promise<boolean> {
  const db = getDb();
  const [totp] = await db.select({ confirmedAt: userTotp.confirmedAt }).from(userTotp).where(eq(userTotp.userId, userId));
  if (!totp?.confirmedAt) return false;
  const [verified] = await db.select({ t: mfaSessions.sessionToken }).from(mfaSessions).where(eq(mfaSessions.sessionToken, sessionToken));
  return !verified;
}
