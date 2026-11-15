'use server';

import { userTotp, verifySecondStep } from '@factory/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/guard';
import { checkTotp, encryptSecret, newTotpSecret } from '@/lib/mfa';
import { getSessionToken } from '@/lib/session-token';

function key(): string {
  const k = process.env.MFA_ENCRYPTION_KEY;
  if (!k) throw new Error('MFA_ENCRYPTION_KEY is required');
  return k;
}

export async function beginEnrollment(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const db = getDb();
  const [existing] = await db.select().from(userTotp).where(eq(userTotp.userId, session.user.id));
  if (existing?.confirmedAt) return; // never replace a confirmed secret from this action
  const secretEncrypted = encryptSecret(newTotpSecret(), key());
  await db.insert(userTotp).values({ userId: session.user.id, secretEncrypted }).onConflictDoUpdate({ target: userTotp.userId, set: { secretEncrypted } });
  revalidatePath('/app/security');
}

export async function submitCode(data: FormData): Promise<void> {
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) return;
  await verifySecondStep(getDb(), { userId: session.user.id, sessionToken: token, code: String(data.get('code') ?? '') }, (stored, code) => checkTotp(stored, code, key()));
  revalidatePath('/app/security');
}
