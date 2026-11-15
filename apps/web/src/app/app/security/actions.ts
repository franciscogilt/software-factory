'use server';

import { createRecoveryCodes, recordAudit, redeemRecoveryCode, userTotp, verifySecondStep } from '@factory/db';
import { timedFlow, type Outcome } from '@factory/jobs';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getT } from '@/i18n/server';
import { getDb } from '@/lib/guard';
import { checkTotp, encryptSecret, newTotpSecret } from '@/lib/mfa';
import { getSessionToken } from '@/lib/session-token';

function key(): string {
  const k = process.env.MFA_ENCRYPTION_KEY;
  if (!k) throw new Error('MFA_ENCRYPTION_KEY is required');
  return k;
}

export type CodesState = { codes: string[] } | { error: string } | null;

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

// First successful verification confirms the enrollment and shows the recovery codes once.
export async function submitCode(_prev: CodesState, data: FormData): Promise<CodesState> {
  return timedFlow(getDb(), 'twostep_code', () => withOutcome(verifyCode(data)));
}

// A wrong or locked code is an expected refusal, not a failure of the flow.
async function withOutcome(result: Promise<CodesState>): Promise<{ value: CodesState; outcome: Outcome }> {
  const value = await result;
  return { value, outcome: value && 'error' in value ? 'limited' : 'success' };
}

async function verifyCode(data: FormData): Promise<CodesState> {
  const { t } = await getT();
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) return { error: t('common.mustSignInAgain') };
  const db = getDb();
  const [before] = await db.select().from(userTotp).where(eq(userTotp.userId, session.user.id));
  const outcome = await verifySecondStep(db, { userId: session.user.id, sessionToken: token, code: String(data.get('code') ?? '') }, (stored, code) => checkTotp(stored, code, key()));
  // On first confirmation, return the recovery codes without revalidating: a re-render would replace this
  // form with the "verified" view and the codes (shown only once) would disappear before the user saves them.
  if (outcome === 'verified' && before && !before.confirmedAt) {
    await recordAudit(db, { actorUserId: session.user.id, action: 'mfa.enrolled' });
    return { codes: await createRecoveryCodes(db, session.user.id) };
  }
  revalidatePath('/app/security');
  if (outcome === 'verified') return null;
  return { error: t(outcome === 'locked' ? 'security.locked' : 'security.wrongCode') };
}

export async function submitRecoveryCode(_prev: CodesState, data: FormData): Promise<CodesState> {
  return timedFlow(getDb(), 'twostep_recovery', () => withOutcome(redeemCode(data)));
}

async function redeemCode(data: FormData): Promise<CodesState> {
  const { t } = await getT();
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) return { error: t('common.mustSignInAgain') };
  const outcome = await redeemRecoveryCode(getDb(), { userId: session.user.id, sessionToken: token, code: String(data.get('code') ?? '') });
  revalidatePath('/app/security');
  if (outcome === 'verified') {
    await recordAudit(getDb(), { actorUserId: session.user.id, action: 'mfa.recovery_code_used' });
    return null;
  }
  return { error: t(outcome === 'locked' ? 'security.locked' : 'security.wrongRecovery') };
}

// Only from a session already verified in two steps. Old codes stop working.
export async function regenerateRecoveryCodes(): Promise<CodesState> {
  const { t } = await getT();
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) return { error: t('common.mustSignInAgain') };
  const db = getDb();
  const { mfaSessions } = await import('@factory/db');
  const [verified] = await db.select().from(mfaSessions).where(eq(mfaSessions.sessionToken, token));
  if (!verified) return { error: t('security.verifyFirst') };
  await recordAudit(db, { actorUserId: session.user.id, action: 'mfa.recovery_codes_regenerated' });
  return { codes: await createRecoveryCodes(db, session.user.id) };
}
