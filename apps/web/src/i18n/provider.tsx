'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createTranslate, type Locale, type Translate } from './index';

const Context = createContext<{ t: Translate; locale: Locale } | null>(null);

// Client components get their translations from here; the locale is decided once on the server.
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ t: createTranslate(locale), locale }), [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useT() {
  const value = useContext(Context);
  if (!value) throw new Error('useT must be used inside I18nProvider');
  return value;
}
