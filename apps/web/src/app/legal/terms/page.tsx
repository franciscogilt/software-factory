import Link from 'next/link';
import { getT } from '@/i18n/server';

export default async function TermsPage() {
  const { t } = await getT();
  return (
    <main>
      <p role="note">{t('legal.draftBanner')}</p>
      <h1>{t('legal.termsTitle')}</h1>
      <p>{t('legal.termsBody')}</p>
      <p><Link href="/legal/privacy">{t('privacy.seePolicy')}</Link> · <Link href="/">{t('legal.back')}</Link></p>
    </main>
  );
}
