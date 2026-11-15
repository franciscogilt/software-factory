import { cookies } from 'next/headers';
import { dismissCookieNotice } from './actions';
import { getT } from './server';

export const COOKIE_NOTICE = 'cookie_notice';

// Informative notice: we only set essential cookies, so no consent is needed. When analytics exist, this becomes a consent choice.
export async function CookieNotice() {
  if ((await cookies()).get(COOKIE_NOTICE)) return null;
  const { t } = await getT();
  return (
    <aside aria-label={t('cookies.label')}>
      <p>{t('cookies.text')}</p>
      <form action={dismissCookieNotice}><button type="submit">{t('cookies.ok')}</button></form>
    </aside>
  );
}
