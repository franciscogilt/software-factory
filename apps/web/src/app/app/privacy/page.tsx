import { DELETION_GRACE_MS, users } from '@factory/db';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getT } from '@/i18n/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/guard';
import { DeleteForm } from './forms';

export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { t } = await getT();
  const [user] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, session.user.id));
  return (
    <main>
      <h1>{t('privacy.title')}</h1>
      <section aria-labelledby="export">
        <h2 id="export">{t('privacy.exportTitle')}</h2>
        <p>{t('privacy.exportText')}</p>
        <a href="/app/privacy/export">{t('privacy.exportButton')}</a>
      </section>
      <section aria-labelledby="delete">
        <h2 id="delete">{t('privacy.deleteTitle')}</h2>
        {user?.email && <DeleteForm email={user.email} days={DELETION_GRACE_MS / 86_400_000} />}
      </section>
      <p><Link href="/legal/terms">{t('privacy.seeTerms')}</Link> · <Link href="/legal/privacy">{t('privacy.seePolicy')}</Link></p>
    </main>
  );
}
