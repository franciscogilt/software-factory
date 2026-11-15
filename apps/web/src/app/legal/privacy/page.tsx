import Link from 'next/link';
import { getT } from '@/i18n/server';

export default async function PolicyPage() {
  const { t } = await getT();
  return (
    <main>
      <p role="note">{t('legal.draftBanner')}</p>
      <h1>{t('legal.policyTitle')}</h1>
      <ul>
        <li>{t('legal.policyData')}</li>
        <li>{t('legal.policyRights')}</li>
        <li>{t('legal.policyAudit')}</li>
        <li>{t('legal.policyCookies')}</li>
      </ul>
      <p><Link href="/legal/terms">{t('privacy.seeTerms')}</Link> · <Link href="/">{t('legal.back')}</Link></p>
    </main>
  );
}
