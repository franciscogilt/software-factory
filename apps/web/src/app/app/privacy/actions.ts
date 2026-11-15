'use server';

import { acceptTerms, cancelAccountDeletion, hitRateLimit, requestAccountDeletion, users } from '@factory/db';
import { enqueue } from '@factory/jobs';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formatDateTime, formatSettings } from '@/i18n/format';
import { getT } from '@/i18n/server';
import { auth } from '@/lib/auth';
import { deletionScheduledEmail } from '@/lib/emails';
import { getDb } from '@/lib/guard';
import { secondStepMissing } from '@/lib/privacy-guard';
import { getSessionToken } from '@/lib/session-token';
import { TERMS_VERSION } from '@/lib/terms';

export type PrivacyState = { error: string } | null;

export async function acceptTermsAction(_prev: PrivacyState, data: FormData): Promise<PrivacyState> {
  const { t } = await getT();
  const session = await auth();
  if (!session?.user?.id) return { error: t('common.mustSignInAgain') };
  if (data.get('accept') !== 'on') return { error: t('terms.mustCheck') };
  await acceptTerms(getDb(), session.user.id, TERMS_VERSION);
  revalidatePath('/app', 'layout');
  return null;
}

// Asks for deletion: needs the typed email (and the second step when set up). Ends all sessions on success.
export async function requestDeletionAction(_prev: PrivacyState, data: FormData): Promise<PrivacyState> {
  const { t, locale } = await getT();
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) return { error: t('common.mustSignInAgain') };
  const db = getDb();
  const userId = session.user.id;
  const limit = await hitRateLimit(db, { key: `privacy-delete:${userId}`, limit: 5, windowMs: 3_600_000 });
  if (!limit.allowed) return { error: t('privacy.tooMany') };
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!user?.email || String(data.get('email') ?? '').trim().toLowerCase() !== user.email.toLowerCase()) return { error: t('privacy.wrongEmail') };
  if (await secondStepMissing(userId, token)) return { error: t('privacy.needTwoStep') };

  const result = await requestAccountDeletion(db, userId);
  if (!result.ok) {
    if (result.reason === 'sole_owner') return { error: t('privacy.soleOwner', { names: result.organizations.map((o) => o.name).join(', ') }) };
    return { error: t('common.mustSignInAgain') };
  }
  await enqueue(db, {
    type: 'email.send',
    payload: { to: user.email, ...deletionScheduledEmail(formatDateTime(result.scheduledFor, locale, formatSettings().timeZone)) },
    idempotencyKey: `deletion-requested:${userId}:${result.scheduledFor.getTime()}`,
  });
  redirect('/');
}

export async function cancelDeletionAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  await cancelAccountDeletion(getDb(), session.user.id);
  revalidatePath('/app', 'layout');
}

