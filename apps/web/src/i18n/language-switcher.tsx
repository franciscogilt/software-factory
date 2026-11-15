import { setLocale } from './actions';
import { getT } from './server';
import { LOCALES } from './index';

const NAMES = { es: 'Español', en: 'English' } as const;

export async function LanguageSwitcher() {
  const { t, locale } = await getT();
  return (
    <nav aria-label={t('common.language')}>
      {LOCALES.map((l) => (
        <form key={l} action={setLocale} style={{ display: 'inline' }}>
          <input type="hidden" name="locale" value={l} />
          <button type="submit" lang={l} aria-current={l === locale ? 'true' : undefined} disabled={l === locale}>{NAMES[l]}</button>
        </form>
      ))}
    </nav>
  );
}
