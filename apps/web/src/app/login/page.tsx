import { getT } from '@/i18n/server';
import { buildProviders } from '@/lib/auth-config';
import { EmailForm, GoogleForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const { t } = await getT();
  const ids = buildProviders(process.env).map((p) => (typeof p === 'function' ? p().id : p.id));
  return (
    <main>
      <h1>{t('login.title')}</h1>
      {ids.length === 0 && <p>{t('login.noMethods')}</p>}
      {ids.includes('google') && <GoogleForm />}
      {ids.includes('nodemailer') && <EmailForm />}
    </main>
  );
}
