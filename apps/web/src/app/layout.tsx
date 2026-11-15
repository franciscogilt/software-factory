import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/i18n/provider';
import { CookieNotice } from '@/i18n/cookie-notice';
import { LanguageSwitcher } from '@/i18n/language-switcher';
import { getT } from '@/i18n/server';

// Pages must be rendered per request so every response carries its own CSP nonce.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t('common.appName') };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale } = await getT();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale}>
          <header><LanguageSwitcher /></header>
          {children}
          <CookieNotice />
        </I18nProvider>
      </body>
    </html>
  );
}
