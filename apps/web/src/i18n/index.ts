import { en } from './messages/en';
import { es, type Messages } from './messages/es';

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'locale';

const CATALOGS: Record<Locale, Messages> = { es, en };

export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.includes(value as Locale);
}

// Order: the user's saved choice, then the browser's Accept-Language, then Spanish.
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

export function getMessages(locale: Locale): Messages {
  return CATALOGS[locale];
}

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

// Looks a key up in the catalog and fills {placeholders}. A missing key is a bug caught by types and tests;
// at runtime it returns the key itself so a page never crashes over a label.
export function createTranslate(locale: Locale): Translate {
  const catalog = CATALOGS[locale];
  return (key, params) => {
    let node: unknown = catalog;
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
    if (typeof node !== 'string') return key;
    return node.replace(/\{(\w+)\}/g, (whole, name: string) => (params && name in params ? String(params[name]) : whole));
  };
}
