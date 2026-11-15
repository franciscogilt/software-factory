import { cookies, headers } from 'next/headers';
import { createTranslate, LOCALE_COOKIE, resolveLocale, type Locale, type Translate } from './index';

export async function getLocale(): Promise<Locale> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return resolveLocale(jar.get(LOCALE_COOKIE)?.value, h.get('accept-language'));
}

export async function getT(): Promise<{ t: Translate; locale: Locale }> {
  const locale = await getLocale();
  return { t: createTranslate(locale), locale };
}
