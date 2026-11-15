import { mfaSessions, userTotp } from '@factory/db';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
import { getT } from '@/i18n/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/guard';
import { decryptSecret, otpauthUri } from '@/lib/mfa';
import { getSessionToken } from '@/lib/session-token';
import { beginEnrollment } from './actions';
import { CodeForm, RecoveryForm, RegenerateForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const session = await auth();
  const token = await getSessionToken();
  if (!session?.user?.id || !token) redirect('/login');
  const { t } = await getT();
  const db = getDb();
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, session.user.id));
  const [verified] = await db.select().from(mfaSessions).where(eq(mfaSessions.sessionToken, token));

  if (verified) return <main><h1>{t('security.title')}</h1><p>{t('security.verified')}</p><RegenerateForm /></main>;

  const pending = totp && !totp.confirmedAt;
  const qr = pending
    ? await QRCode.toDataURL(otpauthUri(decryptSecret(totp.secretEncrypted, process.env.MFA_ENCRYPTION_KEY ?? ''), session.user.email ?? 'user'))
    : null;

  return (
    <main>
      <h1>{t('security.title')}</h1>
      {!totp && (
        <form action={beginEnrollment}>
          <p>{t('security.protect')}</p>
          <button type="submit">{t('security.enable')}</button>
        </form>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize */}
      {qr && <img src={qr} alt={t('security.qrAlt')} width={200} height={200} />}
      {totp && <CodeForm />}
      {totp?.confirmedAt && <RecoveryForm />}
    </main>
  );
}
