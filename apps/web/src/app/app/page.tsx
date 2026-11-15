import { auth, signOut } from '@/lib/auth';
import { getT } from '@/i18n/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AppHome() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { t } = await getT();
  return (
    <main>
      <h1>{t('app.greeting', { name: session.user.name ?? session.user.email ?? '' })}</h1>
      <p><Link href="/app/privacy">{t('privacy.navLink')}</Link></p>
      <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
        <button type="submit">{t('common.signOut')}</button>
      </form>
    </main>
  );
}
