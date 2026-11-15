import { mfaSessions, userTotp } from '@factory/db';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
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
  const db = getDb();
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, session.user.id));
  const [verified] = await db.select().from(mfaSessions).where(eq(mfaSessions.sessionToken, token));

  if (verified) return <main><h1>Verificación en dos pasos</h1><p>Esta sesión está verificada.</p><RegenerateForm /></main>;

  const pending = totp && !totp.confirmedAt;
  const qr = pending
    ? await QRCode.toDataURL(otpauthUri(decryptSecret(totp.secretEncrypted, process.env.MFA_ENCRYPTION_KEY ?? ''), session.user.email ?? 'user'))
    : null;

  return (
    <main>
      <h1>Verificación en dos pasos</h1>
      {!totp && (
        <form action={beginEnrollment}>
          <p>Protege tu cuenta con una app de autenticación.</p>
          <button type="submit">Activar</button>
        </form>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize */}
      {qr && <img src={qr} alt="Código QR para tu app de autenticación" width={200} height={200} />}
      {totp && <CodeForm />}
      {totp?.confirmedAt && <RecoveryForm />}
    </main>
  );
}
