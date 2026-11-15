import { getT } from '@/i18n/server';

export default async function Home() {
  const { t } = await getT();
  return (
    <main>
      <h1>{t('common.appName')}</h1>
      <p>{t('home.intro')}</p>
    </main>
  );
}
